import { z } from "zod";
import type { Prisma, SaleType } from "@prisma/client";
import { db } from "../db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import type { Actor } from "../auth/actor";
import { assertActive } from "../auth/permissions";
import { getCommerceSettings } from "../settings";
import { allocateOrder, completeOrder, failPayment, freezeForDispute, refundOrder, unfreezeAfterDispute } from "./finance";
import { promoDiscount } from "../commission/engine";
import { paymentProvider } from "../payments";
import { resolveAttribution } from "./affiliate";
import { notify } from "./notifications";
import { audit } from "../audit";
import { randomToken } from "../auth/password";
import { formatEUR } from "@/lib/money";

// ───────────── Panier ─────────────

export async function getCart(userId: string) {
  return db.cart.findUnique({
    where: { userId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          variant: { include: { inventory: true } },
          product: { include: { images: { take: 1, orderBy: { position: "asc" } }, inventory: true, owner: { select: { id: true, displayName: true, primaryRole: true, supplierProfile: { select: { companyName: true } } } } } },
        },
      },
    },
  });
}

export async function cartCount(userId: string) {
  const c = await db.cart.findUnique({ where: { userId }, include: { _count: { select: { items: true } } } });
  return c?._count.items ?? 0;
}

export async function addToCart(actor: Actor, input: { productId: string; variantId?: string | null; quantity?: number; attributionIds?: string[] }) {
  assertActive(actor);
  const qty = Math.max(1, Math.min(99, Math.floor(input.quantity ?? 1)));
  const p = await db.product.findUnique({ where: { id: input.productId }, include: { variants: true, inventory: true } });
  if (!p || p.status !== "ACTIVE") throw new AppError("Ce produit n'est plus disponible");
  if (p.ownerId === actor.id) throw new AppError("Vous ne pouvez pas acheter votre propre annonce");
  if (p.variants.length && !input.variantId) throw new AppError("Choisissez une variante");
  if (input.variantId && !p.variants.some((v) => v.id === input.variantId)) throw new AppError("Variante inconnue");
  const inv = p.inventory.find((i) => (input.variantId ? i.variantId === input.variantId : i.variantId === null));
  if (!inv || inv.quantity < qty) throw new AppError("Stock insuffisant");

  const attribution = await resolveAttribution(p.id, input.attributionIds ?? [], actor.id);
  const offer = await db.productOffer.findFirst({ where: { productId: p.id, buyerId: actor.id, status: "ACCEPTED" }, orderBy: { decidedAt: "desc" } });

  const cart = await db.cart.upsert({ where: { userId: actor.id }, create: { userId: actor.id }, update: {} });
  const existing = await db.cartItem.findFirst({ where: { cartId: cart.id, productId: p.id, variantId: input.variantId ?? null } });
  if (existing) {
    await db.cartItem.update({
      where: { id: existing.id },
      data: { quantity: Math.min(inv.quantity, existing.quantity + qty), attributionId: attribution?.id ?? existing.attributionId },
    });
  } else {
    await db.cartItem.create({
      data: { cartId: cart.id, productId: p.id, variantId: input.variantId ?? null, quantity: qty, attributionId: attribution?.id, offerId: offer?.id },
    });
  }
}

export async function updateCartItem(actor: Actor, itemId: string, quantity: number) {
  const item = await db.cartItem.findUnique({ where: { id: itemId }, include: { cart: true } });
  if (!item || item.cart.userId !== actor.id) throw new ForbiddenError();
  if (quantity <= 0) await db.cartItem.delete({ where: { id: itemId } });
  else await db.cartItem.update({ where: { id: itemId }, data: { quantity: Math.min(99, Math.floor(quantity)) } });
}

// ───────────── Commande ─────────────

export const checkoutSchema = z.object({
  shippingName: z.string().trim().min(2, "Nom du destinataire requis").max(100),
  shippingLine1: z.string().trim().min(3, "Adresse requise").max(200),
  shippingLine2: z.string().trim().max(200).optional().nullable(),
  shippingPostal: z.string().trim().regex(/^\d{5}$/, "Code postal à 5 chiffres"),
  shippingCity: z.string().trim().min(2, "Ville requise").max(100),
  carrier: z.string().trim().max(40).optional().nullable(),
  promoCode: z.string().trim().max(40).optional().nullable(),
  acceptTerms: z.literal(true, { message: "Vous devez accepter les conditions générales de vente" }),
});

function orderNumber() {
  const d = new Date();
  return `M3X-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${randomToken(4).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`;
}

/** Prix applicable : offre acceptée > prix de variante > prix produit. Jamais une valeur envoyée par le client. */
async function unitPriceFor(item: { offerId: string | null; product: { id: string; priceCents: number }; variant: { priceCents: number | null } | null }, buyerId: string) {
  if (item.offerId) {
    const offer = await db.productOffer.findUnique({ where: { id: item.offerId } });
    if (offer && offer.status === "ACCEPTED" && offer.buyerId === buyerId && offer.productId === item.product.id) return offer.amountCents;
  }
  return item.variant?.priceCents ?? item.product.priceCents;
}

/**
 * Transforme le panier en commandes (une par vendeur) et en un paiement unique, réserve le stock
 * atomiquement, fige les taux de commission, puis ouvre la session de paiement du prestataire.
 */
export async function checkout(actor: Actor, raw: unknown, appUrl: string) {
  assertActive(actor);
  const input = checkoutSchema.parse(raw);
  const settings = await getCommerceSettings();
  const cart = await db.cart.findUnique({
    where: { userId: actor.id },
    include: {
      items: {
        include: {
          variant: true,
          product: {
            include: {
              owner: { include: { supplierProfile: true } },
              contract: true,
              commissionRules: { where: { active: true }, orderBy: { createdAt: "desc" }, take: 1 },
            },
          },
        },
      },
    },
  });
  if (!cart || !cart.items.length) throw new AppError("Votre panier est vide");

  type Line = {
    cartItem: (typeof cart.items)[number]; unitPriceCents: number; saleType: SaleType; professionalId: string | null;
    contractId: string | null; attributionId: string | null; bps: number | null; fixed: number | null;
  };
  const lines: Line[] = [];
  for (const ci of cart.items) {
    const p = ci.product;
    if (p.status !== "ACTIVE" || p.owner.status !== "ACTIVE") throw new AppError(`« ${p.title} » n'est plus disponible : retirez-le du panier`);
    if (p.ownerId === actor.id) throw new AppError("Vous ne pouvez pas acheter votre propre annonce");
    if (p.sellerKind === "SUPPLIER" && settings.requireVerifiedSupplier && p.owner.supplierProfile?.verificationStatus !== "VERIFIED") {
      throw new AppError(`« ${p.title} » n'est pas encore disponible à la vente`);
    }
    const unitPriceCents = await unitPriceFor(ci, actor.id);
    let saleType: SaleType = p.sellerKind === "SUPPLIER" ? "SUPPLIER_DIRECT" : "P2P";
    let professionalId: string | null = null, contractId: string | null = null, attributionId: string | null = null;
    let bps: number | null = null, fixed: number | null = null;
    if (p.sellerKind === "INDIVIDUAL" && p.contract && p.contract.status === "ACTIVE" && p.contract.endsAt > new Date()) {
      saleType = "DELEGATED"; professionalId = p.contract.professionalId; contractId = p.contract.id; bps = p.contract.commissionBps;
    }
    if (p.sellerKind === "SUPPLIER" && p.affiliateEnabled && ci.attributionId && p.commissionRules[0]) {
      const att = await db.affiliateAttribution.findUnique({ where: { id: ci.attributionId }, include: { link: { include: { professional: { include: { professionalProfile: true } } } } } });
      const proOk = att && att.link.productId === p.id && att.expiresAt > new Date() && !att.convertedAt
        && att.link.professionalId !== actor.id && att.link.professional.status === "ACTIVE"
        && (!settings.requireVerifiedProfessional || att.link.professional.professionalProfile?.verificationStatus === "VERIFIED");
      if (proOk) {
        const rule = p.commissionRules[0];
        saleType = "SUPPLIER_AFFILIATE"; professionalId = att.link.professionalId; attributionId = att.id;
        if (rule.type === "FIXED") fixed = rule.value; else bps = rule.value;
      }
    }
    lines.push({ cartItem: ci, unitPriceCents, saleType, professionalId, contractId, attributionId, bps, fixed });
  }

  // Code promo (remise financée par la plateforme, répartie au prorata des commandes)
  const subtotalAll = lines.reduce((a, l) => a + l.unitPriceCents * l.cartItem.quantity, 0);
  let promo: Awaited<ReturnType<typeof db.promoCode.findUnique>> = null;
  let discountAll = 0;
  if (input.promoCode) {
    promo = await db.promoCode.findUnique({ where: { code: input.promoCode.toUpperCase() } });
    const now = new Date();
    if (!promo || !promo.active || (promo.validFrom && promo.validFrom > now) || (promo.validUntil && promo.validUntil < now) || (promo.maxUses != null && promo.usedCount >= promo.maxUses)) {
      throw new AppError("Code promotionnel invalide ou expiré");
    }
    discountAll = promoDiscount(promo, subtotalAll);
    if (discountAll === 0) throw new AppError(`Code valable dès ${formatEUR(promo.minOrderCents)} d'achat`);
  }

  const bySeller = new Map<string, Line[]>();
  for (const l of lines) bySeller.set(l.cartItem.product.ownerId, [...(bySeller.get(l.cartItem.product.ownerId) ?? []), l]);

  const transferGroup = `tg_${randomToken(12)}`;
  const { payment, orders } = await db.$transaction(async (tx) => {
    // Réservation atomique du stock : impossible de vendre plus que disponible, même en concurrence.
    for (const l of lines) {
      const where: Prisma.InventoryWhereInput = l.cartItem.variantId
        ? { variantId: l.cartItem.variantId, quantity: { gte: l.cartItem.quantity } }
        : { productId: l.cartItem.productId, variantId: null, quantity: { gte: l.cartItem.quantity } };
      const r = await tx.inventory.updateMany({ where, data: { quantity: { decrement: l.cartItem.quantity } } });
      if (r.count === 0) throw new AppError(`Stock insuffisant pour « ${l.cartItem.product.title} »`);
    }
    const sellers = [...bySeller.entries()];
    let discountLeft = discountAll;
    const drafts = sellers.map(([sellerId, ls], idx) => {
      const subtotal = ls.reduce((a, l) => a + l.unitPriceCents * l.cartItem.quantity, 0);
      const shipping = Math.max(...ls.map((l) => l.cartItem.product.shippingCents));
      const discount = idx === sellers.length - 1 ? discountLeft : Math.floor((discountAll * subtotal) / Math.max(1, subtotalAll));
      discountLeft -= discount;
      return { sellerId, ls, subtotal, shipping, discount, total: subtotal + shipping - discount };
    });
    const amount = drafts.reduce((a, d) => a + d.total, 0);
    if (amount < 50) throw new AppError("Montant de commande trop faible");
    const payment = await tx.payment.create({
      data: { buyerId: actor.id, provider: paymentProvider().name, amountCents: amount, transferGroup, idempotencyKey: `checkout:${transferGroup}` },
    });
    const orders = [];
    for (const d of drafts) {
      const seller = d.ls[0].cartItem.product.owner;
      const order = await tx.order.create({
        data: {
          number: orderNumber(), buyerId: actor.id, sellerId: d.sellerId, paymentId: payment.id,
          subtotalCents: d.subtotal, shippingCents: d.shipping, discountCents: d.discount, totalCents: d.total,
          shippingName: input.shippingName, shippingLine1: input.shippingLine1, shippingLine2: input.shippingLine2 || null,
          shippingPostal: input.shippingPostal, shippingCity: input.shippingCity, carrierChoice: input.carrier || null,
          promoCodeId: d.discount > 0 ? promo?.id : null, sellerIsProfessional: seller.primaryRole === "SUPPLIER",
          items: {
            create: d.ls.map((l) => ({
              productId: l.cartItem.productId, variantId: l.cartItem.variantId, title: l.cartItem.product.title + (l.cartItem.variant ? ` — ${l.cartItem.variant.name}` : ""),
              unitPriceCents: l.unitPriceCents, quantity: l.cartItem.quantity, saleType: l.saleType, contractId: l.contractId,
              professionalId: l.professionalId, attributionId: l.attributionId, commissionBpsSnapshot: l.bps, commissionFixedSnapshot: l.fixed,
            })),
          },
        },
        include: { items: true },
      });
      const shipperPro = d.ls.find((l) => l.saleType === "DELEGATED" && l.cartItem.product.contract?.handlesShipping);
      await allocateOrder(tx, {
        id: order.id, sellerId: d.sellerId, shippingCents: d.shipping, discountCents: d.discount,
        shipperId: shipperPro?.professionalId ?? d.sellerId, shipperIsPro: !!shipperPro, items: order.items,
      }, settings);
      orders.push(order);
    }
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    await audit(actor.id, "checkout.create", "Payment", payment.id, { amountCents: amount, orders: orders.length }, tx);
    return { payment, orders };
  });

  try {
    const session = await paymentProvider().createCheckout({
      paymentId: payment.id, amountCents: payment.amountCents, transferGroup, idempotencyKey: payment.idempotencyKey,
      description: `Commande MARKETPLACE 3X (${orders.map((o) => o.number).join(", ")})`, customerEmail: actor.email,
      successUrl: `${appUrl}/paiement/retour?payment=${payment.id}`, cancelUrl: `${appUrl}/panier?annule=1`,
    });
    await db.payment.update({ where: { id: payment.id }, data: { providerRef: session.providerRef } });
    return { paymentId: payment.id, redirectUrl: session.redirectUrl };
  } catch (e) {
    await failPayment(payment.id, "provider_error");
    throw new AppError(`Le paiement n'a pas pu être initialisé : ${(e as Error).message}`);
  }
}

// ───────────── Accès & suivi ─────────────

export async function orderRoleFor(actor: Actor, orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: { include: { contract: true } } } });
  if (!order) throw new NotFoundError("Commande introuvable");
  const shipperPro = order.items.find((i) => i.saleType === "DELEGATED" && i.contract?.handlesShipping)?.professionalId ?? null;
  const roles = {
    buyer: order.buyerId === actor.id,
    seller: order.sellerId === actor.id,
    professional: order.items.some((i) => i.professionalId === actor.id),
    admin: actor.roles.includes("ADMIN"),
    shipper: (shipperPro ?? order.sellerId) === actor.id,
  };
  if (!roles.buyer && !roles.seller && !roles.professional && !roles.admin) throw new ForbiddenError();
  return { order, roles, shipperId: shipperPro ?? order.sellerId };
}

export async function getOrderDetail(actor: Actor, orderId: string) {
  const { roles } = await orderRoleFor(actor, orderId);
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      buyer: { select: { id: true, displayName: true } },
      seller: { select: { id: true, displayName: true, primaryRole: true, supplierProfile: { select: { companyName: true } } } },
      items: {
        include: {
          product: { include: { images: { take: 1, orderBy: { position: "asc" } } } },
          commissions: { include: { history: { orderBy: { createdAt: "asc" } } } },
          contract: { include: { professional: { select: { id: true, displayName: true } } } },
          attribution: { include: { link: { include: { professional: { select: { id: true, displayName: true } } } } } },
        },
      },
      shipments: { orderBy: { shippedAt: "desc" } },
      disputes: { orderBy: { createdAt: "desc" } },
      refunds: true,
      reviews: true,
      payment: { select: { provider: true, status: true, amountCents: true } },
    },
  });
  // Confidentialité : chaque partie ne voit que ses propres lignes financières.
  for (const item of order.items) {
    item.commissions = item.commissions.filter((c) => roles.admin || c.beneficiaryId === actor.id);
  }
  return { order, roles };
}

const shipSchema = z.object({ carrier: z.string().min(2).max(40), trackingNumber: z.string().trim().max(60).optional().nullable() });

export async function markShipped(actor: Actor, orderId: string, raw: unknown) {
  const input = shipSchema.parse(raw);
  const { order, roles } = await orderRoleFor(actor, orderId);
  if (!roles.shipper && !roles.admin) throw new ForbiddenError("Seul le responsable de l'expédition peut déclarer l'envoi");
  const r = await db.order.updateMany({ where: { id: orderId, status: "PAID" }, data: { status: "SHIPPED", shippedAt: new Date() } });
  if (r.count === 0) throw new AppError("Commande non expédiable dans son état actuel");
  await db.shipment.create({ data: { orderId, handledById: actor.id, carrier: input.carrier, trackingNumber: input.trackingNumber || null } });
  await audit(actor.id, "order.ship", "Order", orderId, input);
  await notify(order.buyerId, "shipment.sent", "Commande expédiée", `Votre commande ${order.number} a été expédiée (${input.carrier}${input.trackingNumber ? `, suivi ${input.trackingNumber}` : ""}).`, `/commandes/${orderId}`);
}

/** Livraison constatée (transporteur, expéditeur ou acheteur). Point d'intégration des API transporteurs. */
export async function markDelivered(actor: Actor | null, orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (actor) {
    const { roles } = await orderRoleFor(actor, orderId);
    if (!roles.shipper && !roles.buyer && !roles.admin) throw new ForbiddenError();
  }
  const r = await db.order.updateMany({ where: { id: orderId, status: "SHIPPED" }, data: { status: "DELIVERED", deliveredAt: new Date() } });
  if (r.count === 0) throw new AppError("Commande non livrable dans son état actuel");
  await db.shipment.updateMany({ where: { orderId, status: "IN_TRANSIT", isReturn: false }, data: { status: "DELIVERED", deliveredAt: new Date() } });
  await audit(actor?.id ?? null, "order.delivered", "Order", orderId);
  await notify(order.buyerId, "shipment.delivered", "Colis livré", `La commande ${order.number} est indiquée comme livrée. Confirmez la réception si tout est conforme.`, `/commandes/${orderId}`);
  await notify(order.sellerId, "shipment.delivered", "Colis livré", `La commande ${order.number} a été livrée.`, `/commandes/${orderId}`);
}

export async function confirmReceipt(actor: Actor, orderId: string) {
  const { roles } = await orderRoleFor(actor, orderId);
  if (!roles.buyer) throw new ForbiddenError("Seul l'acheteur confirme la réception");
  const ok = await completeOrder(orderId, actor.id, "Réception confirmée par l'acheteur");
  if (!ok) throw new AppError("La commande doit être expédiée ou livrée");
  await audit(actor.id, "order.receipt_confirmed", "Order", orderId);
}

/** Annulation par le vendeur avant expédition (rupture, erreur) : remboursement intégral automatique. */
export async function cancelBySeller(actor: Actor, orderId: string, reason: string) {
  const { order, roles } = await orderRoleFor(actor, orderId);
  if (!roles.seller && !roles.admin && !roles.shipper) throw new ForbiddenError();
  if (order.status !== "PAID") throw new AppError("Seule une commande payée non expédiée peut être annulée");
  await refundOrder(null, orderId, `Annulation vendeur : ${reason.slice(0, 200)}`, { restock: true });
  await audit(actor.id, "order.cancel_by_seller", "Order", orderId, { reason });
}

export async function reportLost(actor: Actor, orderId: string) {
  const { order, roles } = await orderRoleFor(actor, orderId);
  if (!roles.shipper && !roles.admin) throw new ForbiddenError();
  if (order.status !== "SHIPPED") throw new AppError("Le colis doit être en transit");
  await db.shipment.updateMany({ where: { orderId, status: "IN_TRANSIT" }, data: { status: "LOST" } });
  await openDispute(actor, orderId, { reason: "LOST", description: "Colis déclaré perdu par l'expéditeur" }, true);
}

// ───────────── Litiges ─────────────

export const disputeSchema = z.object({
  reason: z.enum(["NOT_RECEIVED", "NOT_AS_DESCRIBED", "DAMAGED", "RETURN", "LOST", "OTHER"]),
  description: z.string().trim().min(10, "Décrivez le problème (10 caractères minimum)").max(3000),
});
export const disputeReasonLabel: Record<string, string> = {
  NOT_RECEIVED: "Colis non reçu", NOT_AS_DESCRIBED: "Non conforme à la description", DAMAGED: "Article endommagé",
  RETURN: "Retour / rétractation", LOST: "Colis perdu", OTHER: "Autre",
};

export async function openDispute(actor: Actor, orderId: string, raw: unknown, bySystem = false) {
  const input = disputeSchema.parse(raw);
  const { order, roles } = await orderRoleFor(actor, orderId);
  if (!bySystem && !roles.buyer && !roles.seller) throw new ForbiddenError();
  if (!["PAID", "SHIPPED", "DELIVERED", "COMPLETED"].includes(order.status)) throw new AppError("Aucun litige possible sur cette commande");
  const open = await db.dispute.count({ where: { orderId, status: { in: ["OPEN", "UNDER_REVIEW"] } } });
  if (open) throw new AppError("Un litige est déjà ouvert");
  const dispute = await db.$transaction(async (tx) => {
    const d = await tx.dispute.create({ data: { orderId, openedById: actor.id, reason: input.reason, description: input.description } });
    await tx.order.update({ where: { id: orderId }, data: { status: "DISPUTED" } });
    await freezeForDispute(tx, orderId, actor.id);
    await audit(actor.id, "dispute.open", "Dispute", d.id, { orderId, reason: input.reason }, tx);
    return d;
  });
  const others = [order.buyerId, order.sellerId, ...order.items.map((i) => i.professionalId)].filter((x): x is string => !!x && x !== actor.id);
  for (const u of new Set(others)) await notify(u, "dispute.opened", "Litige ouvert", `Un litige a été ouvert sur la commande ${order.number}.`, `/commandes/${orderId}`);
  const admins = await db.userRole.findMany({ where: { role: "ADMIN" }, select: { userId: true } });
  for (const a of admins) await notify(a.userId, "dispute.opened", "Nouveau litige", `Commande ${order.number} : ${disputeReasonLabel[input.reason]}`, `/admin/litiges`);
  return dispute;
}

export async function resolveDispute(actor: Actor, disputeId: string, decision: { refund: boolean; resolution: string; restock?: boolean }) {
  if (!actor.roles.includes("ADMIN")) throw new ForbiddenError();
  const d = await db.dispute.findUnique({ where: { id: disputeId }, include: { order: true } });
  if (!d || !["OPEN", "UNDER_REVIEW"].includes(d.status)) throw new AppError("Litige déjà clos");
  if (decision.refund) {
    await refundOrder(actor, d.orderId, `Litige : ${decision.resolution}`, { restock: decision.restock });
  } else {
    await db.$transaction(async (tx) => { await unfreezeAfterDispute(tx, d.orderId, actor.id); });
  }
  await db.dispute.update({
    where: { id: disputeId },
    data: { status: decision.refund ? "RESOLVED_REFUND" : "RESOLVED_NO_REFUND", resolution: decision.resolution, resolvedAt: new Date() },
  });
  await audit(actor.id, "dispute.resolve", "Dispute", disputeId, decision);
  for (const u of new Set([d.order.buyerId, d.order.sellerId])) {
    await notify(u, "dispute.resolved", "Litige résolu", `Litige sur ${d.order.number} : ${decision.resolution}`, `/commandes/${d.orderId}`);
  }
}

// ───────────── Avis ─────────────

export async function leaveReview(actor: Actor, orderId: string, input: { targetId: string; rating: number; comment?: string }) {
  const { order, roles } = await orderRoleFor(actor, orderId);
  if (!roles.buyer) throw new ForbiddenError("Seul l'acheteur peut évaluer");
  if (order.status !== "COMPLETED") throw new AppError("Vous pourrez laisser un avis après la réception");
  const rating = Math.round(input.rating);
  if (rating < 1 || rating > 5) throw new AppError("Note entre 1 et 5");
  const allowed = new Map<string, "INDIVIDUAL" | "SUPPLIER" | "PROFESSIONAL">();
  const seller = await db.user.findUniqueOrThrow({ where: { id: order.sellerId } });
  allowed.set(order.sellerId, seller.primaryRole === "SUPPLIER" ? "SUPPLIER" : "INDIVIDUAL");
  for (const i of order.items) if (i.professionalId) allowed.set(i.professionalId, "PROFESSIONAL");
  const targetRole = allowed.get(input.targetId);
  if (!targetRole) throw new ForbiddenError();
  await db.review.upsert({
    where: { orderId_authorId_targetId: { orderId, authorId: actor.id, targetId: input.targetId } },
    create: { orderId, authorId: actor.id, targetId: input.targetId, targetRole, rating, comment: input.comment?.slice(0, 2000) },
    update: { rating, comment: input.comment?.slice(0, 2000) },
  });
}

export async function reputation(userId: string) {
  const [agg, sales, disputes, completed] = await Promise.all([
    db.review.aggregate({ where: { targetId: userId }, _avg: { rating: true }, _count: true }),
    db.order.count({ where: { OR: [{ sellerId: userId }, { items: { some: { professionalId: userId } } }], status: "COMPLETED" } }),
    db.dispute.count({ where: { order: { OR: [{ sellerId: userId }, { items: { some: { professionalId: userId } } }] } } }),
    db.order.count({ where: { OR: [{ sellerId: userId }, { items: { some: { professionalId: userId } } }], status: { in: ["COMPLETED", "REFUNDED", "DELIVERED", "SHIPPED"] } } }),
  ]);
  const avg = agg._avg.rating ?? 0;
  // Indice de fiabilité (0–100) : note, volume de ventes réussies, taux de litiges.
  const disputeRate = completed ? disputes / completed : 0;
  const reliability = Math.round(Math.max(0, Math.min(100, (avg ? avg * 14 : 50) + Math.min(20, sales * 2) - disputeRate * 60)));
  return { average: avg, count: agg._count, sales, disputeRate, reliability };
}
