/**
 * SERVICE FINANCIER — seul module autorisé à écrire Payment, CommissionTransaction,
 * CommissionStatusEvent, LedgerEntry, Payout et Refund.
 *
 * Cycle de vie d'une commission :
 *   PENDING (commande créée) → VALIDATING (paiement confirmé par le prestataire)
 *   → VALIDATED (réception confirmée ; délai de rétractation / retour en cours)
 *   → AVAILABLE (délai écoulé, payable) → PAID (transfert effectué)
 *   avec CANCELLED (remboursement / annulation) et DISPUTED (litige, fonds gelés).
 * Une commande n'est jamais considérée comme une vente acquise avant AVAILABLE.
 */
import type { Beneficiary, CommissionKind, CommissionStatus, Prisma, SaleType } from "@prisma/client";
import { db, type Tx } from "../db";
import { AppError, NotFoundError } from "../errors";
import { computeItemSplit } from "../commission/engine";
import { canTransition } from "../commission/status-machine";
import { getCommerceSettings } from "../settings";
import type { CommerceSettings } from "../commission/settings-schema";
import { paymentProvider, providerByName } from "../payments";
import { notify } from "./notifications";
import { audit } from "../audit";
import type { Actor } from "../auth/actor";
import { assertAdmin } from "../auth/permissions";
import { formatEUR } from "@/lib/money";

// ───────────── Journal ─────────────

async function ledger(tx: Tx, e: {
  event: string; amountCents: number; accountRef: string; paymentId?: string; orderId?: string;
  commissionId?: string; payoutId?: string; refundId?: string; metadata?: Prisma.InputJsonValue;
}) {
  await tx.ledgerEntry.create({ data: e });
}

export function accountRef(beneficiary: Beneficiary, userId: string | null, kind: CommissionKind) {
  return beneficiary === "PLATFORM" ? `platform:${kind.toLowerCase()}` : `user:${userId}:${kind.toLowerCase()}`;
}

/** Change le statut d'un ensemble de commissions en respectant la machine à états, avec historique. */
async function transitionCommissions(
  tx: Tx, where: Prisma.CommissionTransactionWhereInput, to: CommissionStatus, reason: string,
  actorId: string | null, extra: Prisma.CommissionTransactionUpdateInput = {},
) {
  const rows = await tx.commissionTransaction.findMany({ where });
  const changed: typeof rows = [];
  for (const c of rows) {
    if (c.status === to || !canTransition(c.status, to)) continue;
    // Mise à jour conditionnelle : protège contre deux traitements concurrents.
    const r = await tx.commissionTransaction.updateMany({ where: { id: c.id, status: c.status }, data: { status: to, ...(extra as object) } });
    if (r.count === 0) continue;
    changed.push(c);
    await tx.commissionStatusEvent.create({ data: { commissionId: c.id, fromStatus: c.status, toStatus: to, reason, actorId } });
  }
  return changed;
}

// ───────────── Répartition à la création de commande ─────────────

type ItemForSplit = {
  id: string; saleType: SaleType; unitPriceCents: number; quantity: number;
  professionalId: string | null; commissionBpsSnapshot: number | null; commissionFixedSnapshot: number | null;
};

/**
 * Crée les lignes de répartition (statut PENDING) d'une commande.
 * Les taux utilisés sont ceux figés sur les articles de commande (snapshots), jamais ceux du client.
 */
export async function allocateOrder(tx: Tx, order: {
  id: string; sellerId: string; shippingCents: number; discountCents: number; shipperId: string; shipperIsPro: boolean;
  items: ItemForSplit[];
}, settings: CommerceSettings) {
  for (const item of order.items) {
    const lines = computeItemSplit({
      saleType: item.saleType, unitPriceCents: item.unitPriceCents, quantity: item.quantity,
      contractCommissionBps: item.commissionBpsSnapshot,
      supplierRule: item.commissionFixedSnapshot != null
        ? { type: "FIXED", value: item.commissionFixedSnapshot }
        : item.saleType === "SUPPLIER_AFFILIATE" && item.commissionBpsSnapshot != null
          ? { type: "PERCENT", value: item.commissionBpsSnapshot } : null,
    }, settings);
    for (const l of lines) {
      if (l.amountCents === 0 && l.beneficiary !== "SELLER" && l.beneficiary !== "SUPPLIER") continue;
      const beneficiaryId = l.beneficiary === "PLATFORM" ? null : l.beneficiary === "PROFESSIONAL" ? item.professionalId : order.sellerId;
      await tx.commissionTransaction.create({
        data: { orderItemId: item.id, beneficiary: l.beneficiary, beneficiaryId, kind: l.kind, amountCents: l.amountCents },
      });
    }
  }
  const first = order.items[0];
  if (order.shippingCents > 0) {
    await tx.commissionTransaction.create({
      data: {
        orderItemId: first.id, kind: "SHIPPING", amountCents: order.shippingCents, beneficiaryId: order.shipperId,
        beneficiary: order.shipperIsPro ? "PROFESSIONAL" : first.saleType.startsWith("SUPPLIER") ? "SUPPLIER" : "SELLER",
      },
    });
  }
  if (order.discountCents > 0) {
    await tx.commissionTransaction.create({
      data: { orderItemId: first.id, kind: "PROMO_DISCOUNT", amountCents: -order.discountCents, beneficiary: "PLATFORM", beneficiaryId: null },
    });
  }
}

// ───────────── Paiement ─────────────

/**
 * Confirme un paiement — appelé UNIQUEMENT par le traitement des webhooks du prestataire
 * (ou par le bac à sable de démonstration, qui emprunte le même chemin). Idempotent.
 */
export async function confirmPayment(paymentId: string, providerPaymentIntent?: string | null) {
  const result = await db.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: paymentId, status: "PENDING" },
      data: { status: "SUCCEEDED", succeededAt: new Date(), providerPaymentIntent: providerPaymentIntent ?? undefined },
    });
    if (claimed.count === 0) return null; // déjà traité (webhook rejoué) ou annulé
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { orders: { include: { items: { include: { product: true } } } } },
    });
    await ledger(tx, { event: "PAYMENT_SUCCEEDED", amountCents: payment.amountCents, accountRef: `buyer:${payment.buyerId}`, paymentId });
    for (const order of payment.orders) {
      await tx.order.update({ where: { id: order.id }, data: { status: "PAID", paidAt: new Date() } });
      const itemIds = order.items.map((i) => i.id);
      await transitionCommissions(tx, { orderItemId: { in: itemIds } }, "VALIDATING", "Paiement confirmé par le prestataire", null);
      const commissions = await tx.commissionTransaction.findMany({ where: { orderItemId: { in: itemIds } } });
      for (const c of commissions) {
        await ledger(tx, {
          event: "ALLOCATION_CREATED", amountCents: c.amountCents, accountRef: accountRef(c.beneficiary, c.beneficiaryId, c.kind),
          paymentId, orderId: order.id, commissionId: c.id,
        });
      }
      for (const item of order.items) {
        if (item.attributionId) await tx.affiliateAttribution.update({ where: { id: item.attributionId }, data: { convertedAt: new Date() } });
        const left = await tx.inventory.aggregate({ where: { productId: item.productId }, _sum: { quantity: true } });
        if ((left._sum.quantity ?? 0) <= 0) await tx.product.update({ where: { id: item.productId }, data: { status: "SOLD_OUT" } });
      }
      if (order.promoCodeId) await tx.promoCode.update({ where: { id: order.promoCodeId }, data: { usedCount: { increment: 1 } } });
    }
    await tx.productOffer.updateMany({ where: { buyerId: payment.buyerId, status: "ACCEPTED", productId: { in: payment.orders.flatMap((o) => o.items.map((i) => i.productId)) } }, data: { status: "USED" } });
    return payment;
  });
  if (!result) return { processed: false };

  await notify(result.buyerId, "payment.confirmed", "Paiement confirmé",
    `Votre paiement de ${formatEUR(result.amountCents)} est confirmé. Les vendeurs ont été prévenus.`, "/espace/achats");
  for (const order of result.orders) {
    await notify(order.sellerId, "product.sold", "Nouvelle vente", `Commande ${order.number} payée : à préparer pour l'expédition.`, `/commandes/${order.id}`);
    const pros = new Set(order.items.map((i) => i.professionalId).filter(Boolean) as string[]);
    for (const p of pros) await notify(p, "order.new", "Vente générée", `Commande ${order.number} : une vente vous est attribuée.`, `/commandes/${order.id}`);
  }
  await grantReferralRewardIfEligible(result.buyerId, result.amountCents);
  return { processed: true };
}

/** Paiement échoué / abandonné : annulation des commandes et remise en stock. Idempotent. */
export async function failPayment(paymentId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({ where: { id: paymentId, status: "PENDING" }, data: { status: reason === "expired" ? "CANCELLED" : "FAILED" } });
    if (claimed.count === 0) return false;
    const orders = await tx.order.findMany({ where: { paymentId }, include: { items: true } });
    for (const o of orders) {
      await tx.order.update({ where: { id: o.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      await transitionCommissions(tx, { orderItemId: { in: o.items.map((i) => i.id) } }, "CANCELLED", `Paiement non abouti (${reason})`, null);
      for (const i of o.items) await restock(tx, i.productId, i.variantId, i.quantity);
    }
    return true;
  });
}

async function restock(tx: Tx, productId: string, variantId: string | null, qty: number) {
  const inv = await tx.inventory.findFirst({ where: variantId ? { variantId } : { productId, variantId: null } });
  if (inv) await tx.inventory.update({ where: { id: inv.id }, data: { quantity: { increment: qty } } });
  await tx.product.updateMany({ where: { id: productId, status: "SOLD_OUT" }, data: { status: "ACTIVE" } });
}

// ───────────── Validation après réception ─────────────

/** Réception confirmée (acheteur, ou automatiquement après le délai configuré). */
export async function completeOrder(orderId: string, actorId: string | null, reason: string) {
  const settings = await getCommerceSettings();
  const done = await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new NotFoundError();
    const r = await tx.order.updateMany({
      where: { id: orderId, status: { in: ["SHIPPED", "DELIVERED"] } },
      data: { status: "COMPLETED", receivedAt: new Date(), completedAt: new Date() },
    });
    if (r.count === 0) return null;
    // Vendeur professionnel (fournisseur) : délai de rétractation de 14 jours ; particulier : délai court.
    const holdDays = order.sellerIsProfessional ? settings.holdDaysProfessional : settings.holdDaysP2P;
    const availableAt = new Date(Date.now() + holdDays * 86400e3);
    await transitionCommissions(tx, { orderItemId: { in: order.items.map((i) => i.id) } }, "VALIDATED", reason, actorId, { availableAt });
    return order;
  });
  if (done) {
    const pros = await db.orderItem.findMany({ where: { orderId }, select: { professionalId: true } });
    for (const p of new Set(pros.map((x) => x.professionalId).filter(Boolean) as string[])) {
      await notify(p, "commission.validated", "Commission validée", `La réception de la commande ${done.number} est confirmée : votre commission sera disponible après le délai de validation.`, "/pro/commissions");
    }
  }
  return !!done;
}

/**
 * Tâche planifiée : rend disponibles les commissions dont le délai est écoulé,
 * confirme automatiquement les réceptions et annule les paiements abandonnés.
 */
export async function runFinanceJobs(now = new Date()) {
  const settings = await getCommerceSettings();
  const due = await db.order.findMany({
    where: { status: "DELIVERED", deliveredAt: { lte: new Date(now.getTime() - settings.autoConfirmReceiptDays * 86400e3) } },
    select: { id: true },
  });
  for (const o of due) await completeOrder(o.id, null, "Réception confirmée automatiquement (délai écoulé)");

  const released = await db.$transaction((tx) =>
    transitionCommissions(tx, { status: "VALIDATED", availableAt: { lte: now } }, "AVAILABLE", "Délai de validation écoulé", null));
  for (const c of released) {
    await ledger(db, { event: "COMMISSION_AVAILABLE", amountCents: c.amountCents, accountRef: accountRef(c.beneficiary, c.beneficiaryId, c.kind), commissionId: c.id });
  }

  const stale = await db.payment.findMany({ where: { status: "PENDING", createdAt: { lte: new Date(now.getTime() - 2 * 3600e3) } }, select: { id: true } });
  for (const p of stale) await failPayment(p.id, "expired");
  return { autoCompleted: due.length, released: released.length, expiredPayments: stale.length };
}

// ───────────── Litiges ─────────────

export async function freezeForDispute(tx: Tx, orderId: string, actorId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId }, select: { id: true } });
  await transitionCommissions(tx, { orderItemId: { in: items.map((i) => i.id) } }, "DISPUTED", "Litige ouvert", actorId);
}

/** Litige clos sans remboursement : on restaure le statut adapté à l'avancement de la commande. */
export async function unfreezeAfterDispute(tx: Tx, orderId: string, actorId: string) {
  const settings = await getCommerceSettings();
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  const ids = order.items.map((i) => i.id);
  if (order.receivedAt) {
    const holdDays = order.sellerIsProfessional ? settings.holdDaysProfessional : settings.holdDaysP2P;
    await transitionCommissions(tx, { orderItemId: { in: ids }, status: "DISPUTED" }, "VALIDATED", "Litige clos sans remboursement", actorId,
      { availableAt: new Date(Date.now() + holdDays * 86400e3) });
  } else {
    await transitionCommissions(tx, { orderItemId: { in: ids }, status: "DISPUTED" }, "VALIDATING", "Litige clos sans remboursement", actorId);
  }
  const status = order.receivedAt ? "COMPLETED" : order.deliveredAt ? "DELIVERED" : order.shippedAt ? "SHIPPED" : "PAID";
  await tx.order.update({ where: { id: orderId }, data: { status } });
}

// ───────────── Remboursements ─────────────

/**
 * Remboursement intégral d'une commande (annulation, retour, litige).
 * Les commissions non versées sont annulées ; une commission déjà versée génère une créance
 * (écriture CLAWBACK_DUE) à recouvrer — point de procédure à valider.
 */
export async function refundOrder(actor: Actor | null, orderId: string, reason: string, opts: { restock?: boolean } = {}) {
  if (actor) assertAdmin(actor);
  const order = await db.order.findUnique({ where: { id: orderId }, include: { payment: true, items: true, refunds: true } });
  if (!order || !order.payment) throw new NotFoundError("Commande introuvable");
  if (order.payment.status !== "SUCCEEDED" && order.payment.status !== "PARTIALLY_REFUNDED") throw new AppError("Paiement non remboursable");
  if (order.status === "REFUNDED" || order.refunds.some((r) => r.status !== "FAILED")) throw new AppError("Commande déjà remboursée");

  const idempotencyKey = `refund:${order.id}`;
  const refund = await db.refund.create({
    data: { orderId, paymentId: order.payment.id, amountCents: order.totalCents, reason, requestedById: actor?.id, idempotencyKey },
  });
  const provider = providerByName(order.payment.provider);
  let res: { providerRef: string; succeeded: boolean };
  try {
    res = await provider.refund({
      paymentIntent: order.payment.providerPaymentIntent, providerRef: order.payment.providerRef ?? "",
      amountCents: order.totalCents, idempotencyKey,
    });
  } catch (e) {
    await db.refund.update({ where: { id: refund.id }, data: { status: "FAILED" } });
    throw new AppError(`Le prestataire a refusé le remboursement : ${(e as Error).message}`);
  }

  await db.$transaction(async (tx) => {
    await tx.refund.update({
      where: { id: refund.id },
      data: { providerRef: res.providerRef, status: res.succeeded ? "SUCCEEDED" : "PENDING", processedAt: res.succeeded ? new Date() : null },
    });
    await tx.order.update({ where: { id: orderId }, data: { status: "REFUNDED", cancelledAt: new Date() } });
    const ids = order.items.map((i) => i.id);
    const paid = await tx.commissionTransaction.findMany({ where: { orderItemId: { in: ids }, status: "PAID" } });
    for (const c of paid) {
      await ledger(tx, { event: "CLAWBACK_DUE", amountCents: -c.amountCents, accountRef: accountRef(c.beneficiary, c.beneficiaryId, c.kind), orderId, commissionId: c.id, refundId: refund.id });
    }
    await transitionCommissions(tx, { orderItemId: { in: ids } }, "CANCELLED", `Remboursement : ${reason}`, actor?.id ?? null);
    await ledger(tx, { event: "REFUND", amountCents: -order.totalCents, accountRef: `buyer:${order.buyerId}`, paymentId: order.paymentId!, orderId, refundId: refund.id });
    const others = await tx.order.count({ where: { paymentId: order.paymentId, status: { not: "REFUNDED" } } });
    await tx.payment.update({ where: { id: order.paymentId! }, data: { status: others === 0 ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
    if (opts.restock) for (const i of order.items) await restock(tx, i.productId, i.variantId, i.quantity);
    await audit(actor?.id ?? null, "order.refund", "Order", orderId, { amountCents: order.totalCents, reason, provider: order.payment!.provider }, tx);
  });
  await notify(order.buyerId, "refund.processed", "Remboursement effectué", `La commande ${order.number} a été remboursée (${formatEUR(order.totalCents)}).`, `/commandes/${order.id}`);
  await notify(order.sellerId, "refund.processed", "Commande remboursée", `La commande ${order.number} a été remboursée à l'acheteur.`, `/commandes/${order.id}`);
  return refund;
}

/** Webhook « charge.refunded » : finalise les remboursements en attente. */
export async function markRefundsSucceeded(paymentIntent: string) {
  const p = await db.payment.findFirst({ where: { providerPaymentIntent: paymentIntent } });
  if (!p) return;
  await db.refund.updateMany({ where: { paymentId: p.id, status: "PENDING" }, data: { status: "SUCCEEDED", processedAt: new Date() } });
}

// ───────────── Versements ─────────────

export async function balances(userId: string) {
  const rows = await db.commissionTransaction.groupBy({ by: ["status"], where: { beneficiaryId: userId }, _sum: { amountCents: true } });
  const by = Object.fromEntries(rows.map((r) => [r.status, r._sum.amountCents ?? 0])) as Partial<Record<CommissionStatus, number>>;
  return {
    pending: (by.PENDING ?? 0),
    validating: (by.VALIDATING ?? 0),
    validated: (by.VALIDATED ?? 0),
    available: (by.AVAILABLE ?? 0),
    paid: (by.PAID ?? 0),
    disputed: (by.DISPUTED ?? 0),
    cancelled: (by.CANCELLED ?? 0),
  };
}

/**
 * Verse au bénéficiaire ses montants disponibles via un transfert du prestataire.
 * Exige un compte bénéficiaire vérifié (KYC chez le prestataire). Les commissions sont
 * « réservées » avant l'appel externe pour empêcher tout double versement.
 */
export async function payoutUser(actor: Actor | null, userId: string) {
  if (actor) assertAdmin(actor);
  const settings = await getCommerceSettings();
  const account = await db.payoutAccount.findUnique({ where: { userId } });
  if (!account || account.status !== "VERIFIED" || !account.payoutsEnabled) throw new AppError("Compte bénéficiaire non vérifié chez le prestataire de paiement");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.status !== "ACTIVE") throw new AppError("Compte suspendu : versements bloqués");

  const payout = await db.$transaction(async (tx) => {
    const avail = await tx.commissionTransaction.findMany({ where: { beneficiaryId: userId, status: "AVAILABLE", payoutId: null } });
    const total = avail.reduce((a, c) => a + c.amountCents, 0);
    if (total <= 0) throw new AppError("Aucun montant disponible");
    if (total < settings.minPayoutCents) throw new AppError(`Montant disponible inférieur au minimum de versement (${formatEUR(settings.minPayoutCents)})`);
    const p = await tx.payout.create({
      data: { userId, amountCents: total, provider: account.provider, idempotencyKey: `payout:${userId}:${Date.now()}` },
    });
    const claimed = await tx.commissionTransaction.updateMany({
      where: { id: { in: avail.map((a) => a.id) }, status: "AVAILABLE", payoutId: null }, data: { payoutId: p.id },
    });
    if (claimed.count !== avail.length) throw new AppError("Versement concurrent détecté, réessayez");
    return p;
  });

  try {
    const res = await providerByName(account.provider).transfer({
      destination: account.providerAccountId, amountCents: payout.amountCents, idempotencyKey: payout.idempotencyKey,
      description: `Versement MARKETPLACE 3X ${payout.id}`,
    });
    await db.$transaction(async (tx) => {
      await tx.payout.update({ where: { id: payout.id }, data: { status: "PAID", providerRef: res.providerRef, paidAt: new Date() } });
      await transitionCommissions(tx, { payoutId: payout.id }, "PAID", "Versement effectué", actor?.id ?? null);
      await ledger(tx, { event: "PAYOUT", amountCents: -payout.amountCents, accountRef: `user:${userId}:payout`, payoutId: payout.id, metadata: { provider: account.provider, ref: res.providerRef } });
      await audit(actor?.id ?? null, "payout.create", "Payout", payout.id, { userId, amountCents: payout.amountCents }, tx);
    });
    await notify(userId, "commission.paid", "Versement effectué", `${formatEUR(payout.amountCents)} ont été versés sur votre compte bénéficiaire.`, "/compte/paiements");
  } catch (e) {
    await db.$transaction([
      db.payout.update({ where: { id: payout.id }, data: { status: "FAILED", failureReason: (e as Error).message } }),
      db.commissionTransaction.updateMany({ where: { payoutId: payout.id }, data: { payoutId: null } }),
    ]);
    throw new AppError(`Échec du transfert : ${(e as Error).message}`);
  }
  return payout;
}

// ───────────── Compte bénéficiaire (KYC chez le prestataire) ─────────────

export async function startPayoutOnboarding(actor: Actor, appUrl: string) {
  const provider = paymentProvider();
  let account = await db.payoutAccount.findUnique({ where: { userId: actor.id } });
  if (!account) {
    const { accountId } = await provider.createConnectedAccount({ email: actor.email, userId: actor.id, business: actor.roles.includes("SUPPLIER") });
    account = await db.payoutAccount.create({ data: { userId: actor.id, provider: provider.name, providerAccountId: accountId, status: "PENDING" } });
    await audit(actor.id, "payout_account.create", "PayoutAccount", account.id, { provider: provider.name });
  }
  return providerByName(account.provider).onboardingLink(account.providerAccountId, `${appUrl}/compte/paiements?retour=1`, `${appUrl}/compte/paiements`);
}

export async function refreshPayoutAccount(userId: string) {
  const account = await db.payoutAccount.findUnique({ where: { userId } });
  if (!account) return null;
  const st = await providerByName(account.provider).accountStatus(account.providerAccountId);
  return db.payoutAccount.update({
    where: { id: account.id },
    data: { payoutsEnabled: st.payoutsEnabled, status: st.payoutsEnabled ? "VERIFIED" : st.detailsSubmitted ? "RESTRICTED" : "PENDING" },
  });
}

// ───────────── Parrainage ─────────────

async function grantReferralRewardIfEligible(buyerId: string, amountCents: number) {
  const settings = await getCommerceSettings();
  if (!settings.referralEnabled || amountCents < settings.referralMinOrderCents) return;
  const buyer = await db.user.findUnique({ where: { id: buyerId } });
  if (!buyer?.referredById) return;
  const exists = await db.referralReward.findUnique({ where: { refereeId: buyerId } });
  if (exists) return;
  await db.referralReward.create({
    data: { referrerId: buyer.referredById, refereeId: buyerId, amountCents: settings.referralRewardCents, reason: "Premier achat du filleul" },
  });
  await notify(buyer.referredById, "referral.reward", "Récompense de parrainage",
    `Votre filleul a effectué son premier achat : ${formatEUR(settings.referralRewardCents)} de récompense (en attente de validation).`, "/compte/parrainage");
}
