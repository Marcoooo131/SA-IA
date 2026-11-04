/**
 * Délégation des ventes : demandes d'accompagnement, propositions de collaboration,
 * contrats (conditions figées), produits confiés et propositions de prix.
 * Le propriétaire garde la propriété des produits et un droit de validation sur les prix.
 */
import { z } from "zod";
import { db } from "../db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import type { Actor } from "../auth/actor";
import { assertActive, assertRole } from "../auth/permissions";
import { getCommerceSettings } from "../settings";
import { isWithinBounds } from "../commission/engine";
import { assertVerifiedProfessional } from "./affiliate";
import { notify } from "./notifications";
import { audit } from "../audit";
import { startConversation } from "./messaging";
import { formatBps, formatEUR } from "@/lib/money";

export const delegationRequestSchema = z.object({
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(20, "Décrivez vos articles (20 caractères minimum)").max(3000),
  city: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().max(10).optional().nullable(),
  categorySlugs: z.array(z.string()).min(1, "Choisissez au moins une catégorie").max(10),
  estimatedItems: z.coerce.number().int().min(1).max(10000),
  estimatedValueCents: z.coerce.number().int().min(0).optional().nullable(),
  mode: z.enum(["SALES_ONLY", "FULL_SERVICE"]),
  maxCommissionBps: z.coerce.number().int().min(0).max(10000).optional().nullable(),
});

export async function createDelegationRequest(actor: Actor, raw: unknown) {
  assertRole(actor, "INDIVIDUAL");
  const input = delegationRequestSchema.parse(raw);
  const r = await db.delegationRequest.create({ data: { ...input, ownerId: actor.id, postalCode: input.postalCode || null } });
  await db.individualProfile.upsert({ where: { userId: actor.id }, create: { userId: actor.id, acceptsDelegation: true }, update: { acceptsDelegation: true } });
  await audit(actor.id, "delegation_request.create", "DelegationRequest", r.id);
  return r;
}

export async function closeDelegationRequest(actor: Actor, id: string) {
  const r = await db.delegationRequest.findUnique({ where: { id } });
  if (!r || r.ownerId !== actor.id) throw new ForbiddenError();
  await db.delegationRequest.update({ where: { id }, data: { status: "CLOSED" } });
}

const offerSchema = z.object({
  commissionBps: z.coerce.number().int(),
  mode: z.enum(["SALES_ONLY", "FULL_SERVICE"]),
  handlesShipping: z.boolean().default(false),
  durationDays: z.coerce.number().int().min(7),
  message: z.string().trim().min(10, "Présentez votre offre (10 caractères minimum)").max(3000),
});

async function validateOfferTerms(input: z.infer<typeof offerSchema>) {
  const s = await getCommerceSettings();
  if (!isWithinBounds(input.commissionBps, s.delegationCommissionMinBps, s.delegationCommissionMaxBps)) {
    throw new AppError(`La commission doit être comprise entre ${formatBps(s.delegationCommissionMinBps)} et ${formatBps(s.delegationCommissionMaxBps)}`);
  }
  if (input.durationDays > s.collaborationMaxDurationDays) throw new AppError(`Durée maximale : ${s.collaborationMaxDurationDays} jours`);
  if (input.mode === "FULL_SERVICE") input.handlesShipping = true;
}

/** Proposition d'un indépendant à un particulier (prospection), éventuellement en réponse à une demande. */
export async function proposeToOwner(actor: Actor, ownerId: string, raw: unknown, requestId?: string | null) {
  await assertVerifiedProfessional(actor);
  const input = offerSchema.parse(raw);
  await validateOfferTerms(input);
  if (ownerId === actor.id) throw new AppError("Proposition à vous-même impossible");
  const owner = await db.user.findUnique({ where: { id: ownerId }, include: { roles: true } });
  if (!owner || owner.status !== "ACTIVE" || !owner.roles.some((r) => r.role === "INDIVIDUAL")) throw new NotFoundError("Particulier introuvable");
  if (requestId) {
    const req = await db.delegationRequest.findUnique({ where: { id: requestId } });
    if (!req || req.ownerId !== ownerId || req.status !== "OPEN") throw new AppError("Demande fermée");
    if (req.maxCommissionBps != null && input.commissionBps > req.maxCommissionBps) throw new AppError(`Le particulier accepte au maximum ${formatBps(req.maxCommissionBps)}`);
  }
  const dup = await db.collaborationOffer.count({ where: { professionalId: actor.id, ownerId, status: "PENDING" } });
  if (dup) throw new AppError("Une proposition est déjà en attente auprès de ce particulier");
  const offer = await db.collaborationOffer.create({
    data: { ...input, fromUserId: actor.id, toUserId: ownerId, professionalId: actor.id, ownerId, requestId: requestId || null },
  });
  await startConversation(actor, ownerId, "Proposition de collaboration", input.message, { offerId: offer.id });
  await notify(ownerId, "collaboration.offer", "Nouvelle proposition commerciale",
    `${actor.displayName} vous propose de commercialiser vos articles (${formatBps(input.commissionBps)} de commission).`, "/espace/delegation");
  await audit(actor.id, "collaboration_offer.create", "CollaborationOffer", offer.id, { commissionBps: input.commissionBps });
  return offer;
}

/** Demande directe d'un particulier à un indépendant choisi dans l'annuaire. */
export async function requestProfessional(actor: Actor, professionalId: string, raw: unknown) {
  assertRole(actor, "INDIVIDUAL");
  const input = offerSchema.parse(raw);
  await validateOfferTerms(input);
  const pro = await db.professionalProfile.findUnique({ where: { userId: professionalId }, include: { user: true } });
  if (!pro || pro.user.status !== "ACTIVE") throw new NotFoundError("Indépendant introuvable");
  if (pro.verificationStatus !== "VERIFIED") throw new AppError("Cet indépendant n'est pas encore vérifié");
  if (input.mode === "FULL_SERVICE" && !pro.offersPickup) throw new AppError("Cet indépendant ne propose pas la récupération des articles");
  const dup = await db.collaborationOffer.count({ where: { professionalId, ownerId: actor.id, status: "PENDING" } });
  if (dup) throw new AppError("Une demande est déjà en attente auprès de cet indépendant");
  const offer = await db.collaborationOffer.create({
    data: { ...input, fromUserId: actor.id, toUserId: professionalId, professionalId, ownerId: actor.id },
  });
  await startConversation(actor, professionalId, "Demande de collaboration", input.message, { offerId: offer.id });
  await notify(professionalId, "collaboration.request", "Nouvelle demande de collaboration",
    `${actor.displayName} souhaite vous confier ses ventes (${formatBps(input.commissionBps)}).`, "/pro/propositions");
  await audit(actor.id, "collaboration_offer.create", "CollaborationOffer", offer.id, { commissionBps: input.commissionBps, direct: true });
  return offer;
}

/** Acceptation / refus par le destinataire. L'acceptation crée un contrat aux conditions figées. */
export async function respondToOffer(actor: Actor, offerId: string, accept: boolean) {
  assertActive(actor);
  const offer = await db.collaborationOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.status !== "PENDING") throw new AppError("Proposition introuvable ou déjà traitée");
  if (offer.toUserId !== actor.id) throw new ForbiddenError("Seul le destinataire peut répondre");
  if (accept && actor.id === offer.professionalId) await assertVerifiedProfessional(actor);
  const result = await db.$transaction(async (tx) => {
    const claimed = await tx.collaborationOffer.updateMany({ where: { id: offerId, status: "PENDING" }, data: { status: accept ? "ACCEPTED" : "REFUSED", decidedAt: new Date() } });
    if (claimed.count === 0) throw new AppError("Proposition déjà traitée");
    if (!accept) return null;
    const contract = await tx.collaborationContract.create({
      data: {
        offerId, ownerId: offer.ownerId, professionalId: offer.professionalId, commissionBps: offer.commissionBps,
        mode: offer.mode, handlesShipping: offer.handlesShipping, endsAt: new Date(Date.now() + offer.durationDays * 86400e3),
      },
    });
    if (offer.requestId) await tx.delegationRequest.update({ where: { id: offer.requestId }, data: { status: "MATCHED" } });
    await audit(actor.id, "contract.create", "CollaborationContract", contract.id, { commissionBps: offer.commissionBps, mode: offer.mode }, tx);
    return contract;
  });
  await notify(offer.fromUserId, accept ? "collaboration.accepted" : "collaboration.refused",
    accept ? "Proposition acceptée" : "Proposition refusée",
    accept ? `${actor.displayName} a accepté la collaboration. Le contrat est actif.` : `${actor.displayName} a décliné la proposition.`,
    accept ? `/collaborations/${result!.id}` : undefined);
  return result;
}

export async function withdrawOffer(actor: Actor, offerId: string) {
  const offer = await db.collaborationOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.fromUserId !== actor.id) throw new ForbiddenError();
  await db.collaborationOffer.updateMany({ where: { id: offerId, status: "PENDING" }, data: { status: "WITHDRAWN", decidedAt: new Date() } });
}

export async function getContractFor(actor: Actor, contractId: string) {
  const c = await db.collaborationContract.findUnique({
    where: { id: contractId },
    include: {
      owner: { select: { id: true, displayName: true, city: true } },
      professional: { select: { id: true, displayName: true, professionalProfile: true } },
      products: { include: { images: { take: 1, orderBy: { position: "asc" } }, inventory: true, priceProposals: { where: { status: "PENDING" } } } },
      priceProposals: { orderBy: { createdAt: "desc" }, take: 30, include: { product: { select: { title: true } } } },
      offer: true,
    },
  });
  if (!c) throw new NotFoundError();
  if (c.ownerId !== actor.id && c.professionalId !== actor.id && !actor.roles.includes("ADMIN")) throw new ForbiddenError();
  return c;
}

/** Le propriétaire valide les produits confiés à l'indépendant. */
export async function entrustProducts(actor: Actor, contractId: string, productIds: string[], minPrices: Record<string, number | null> = {}) {
  const c = await db.collaborationContract.findUnique({ where: { id: contractId } });
  if (!c || c.ownerId !== actor.id) throw new ForbiddenError();
  if (c.status !== "ACTIVE") throw new AppError("Contrat inactif");
  const products = await db.product.findMany({ where: { id: { in: productIds }, ownerId: actor.id } });
  if (products.length !== productIds.length) throw new ForbiddenError("Certains produits ne vous appartiennent pas");
  for (const p of products) {
    if (p.sellerKind !== "INDIVIDUAL") throw new AppError("Seules les annonces de particuliers peuvent être confiées");
    if (p.contractId && p.contractId !== contractId) throw new AppError(`« ${p.title} » est déjà confié à un autre indépendant`);
    const min = minPrices[p.id];
    if (min != null && (min < 0 || min > p.priceCents)) throw new AppError(`Prix plancher invalide pour « ${p.title} »`);
  }
  await db.$transaction(products.map((p) => db.product.update({
    where: { id: p.id }, data: { contractId, minPriceCents: minPrices[p.id] ?? p.minPriceCents },
  })));
  await audit(actor.id, "contract.entrust", "CollaborationContract", contractId, { productIds });
  await notify(c.professionalId, "collaboration.accepted", "Nouveaux articles confiés", `${products.length} article(s) vous ont été confiés.`, `/collaborations/${contractId}`);
}

export async function withdrawProduct(actor: Actor, productId: string) {
  const p = await db.product.findUnique({ where: { id: productId } });
  if (!p || p.ownerId !== actor.id) throw new ForbiddenError();
  const pending = await db.orderItem.count({ where: { productId, order: { status: { in: ["PENDING_PAYMENT", "PAID", "SHIPPED"] } } } });
  if (pending) throw new AppError("Une commande est en cours sur cet article");
  await db.product.update({ where: { id: productId }, data: { contractId: null } });
  await db.priceProposal.updateMany({ where: { productId, status: "PENDING" }, data: { status: "REJECTED", decidedAt: new Date() } });
  await audit(actor.id, "contract.withdraw_product", "Product", productId, { contractId: p.contractId });
}

export async function endContract(actor: Actor, contractId: string) {
  const c = await db.collaborationContract.findUnique({ where: { id: contractId } });
  if (!c || (c.ownerId !== actor.id && c.professionalId !== actor.id && !actor.roles.includes("ADMIN"))) throw new ForbiddenError();
  if (c.status !== "ACTIVE") throw new AppError("Contrat déjà terminé");
  await db.$transaction([
    db.collaborationContract.update({ where: { id: contractId }, data: { status: "ENDED", endedAt: new Date() } }),
    db.product.updateMany({ where: { contractId }, data: { contractId: null } }),
    db.priceProposal.updateMany({ where: { contractId, status: "PENDING" }, data: { status: "REJECTED", decidedAt: new Date() } }),
  ]);
  // Les commandes déjà passées conservent leur taux figé : les commissions en cours restent dues.
  await audit(actor.id, "contract.end", "CollaborationContract", contractId);
  const other = actor.id === c.ownerId ? c.professionalId : c.ownerId;
  await notify(other, "collaboration.refused", "Collaboration terminée", `La collaboration a été clôturée par ${actor.displayName}.`, `/collaborations/${contractId}`);
}

/** L'indépendant propose un nouveau prix ; il n'est appliqué qu'après validation du propriétaire. */
export async function proposePrice(actor: Actor, productId: string, priceCents: number, reason?: string) {
  const p = await db.product.findUnique({ where: { id: productId }, include: { contract: true } });
  if (!p || !p.contract || p.contract.status !== "ACTIVE" || p.contract.professionalId !== actor.id) throw new ForbiddenError();
  if (!Number.isInteger(priceCents) || priceCents < 100) throw new AppError("Prix invalide");
  await db.priceProposal.updateMany({ where: { productId, status: "PENDING" }, data: { status: "REJECTED", decidedAt: new Date() } });
  const prop = await db.priceProposal.create({ data: { productId, contractId: p.contract.id, proposedById: actor.id, priceCents, reason: reason?.slice(0, 500) } });
  await notify(p.ownerId, "price.proposal", "Proposition de prix", `${actor.displayName} propose ${formatEUR(priceCents)} pour « ${p.title} » (actuellement ${formatEUR(p.priceCents)}).`, `/collaborations/${p.contract.id}`);
  return prop;
}

export async function decidePriceProposal(actor: Actor, proposalId: string, approve: boolean) {
  const prop = await db.priceProposal.findUnique({ where: { id: proposalId }, include: { product: true } });
  if (!prop || prop.status !== "PENDING") throw new AppError("Proposition déjà traitée");
  if (prop.product.ownerId !== actor.id) throw new ForbiddenError("Seul le propriétaire valide les prix");
  await db.$transaction(async (tx) => {
    await tx.priceProposal.update({ where: { id: proposalId }, data: { status: approve ? "APPROVED" : "REJECTED", decidedAt: new Date() } });
    if (approve) {
      await tx.product.update({
        where: { id: prop.productId },
        data: { priceCents: prop.priceCents, minPriceCents: prop.product.minPriceCents != null ? Math.min(prop.product.minPriceCents, prop.priceCents) : null },
      });
    }
    await audit(actor.id, approve ? "price.approve" : "price.reject", "Product", prop.productId, { from: prop.product.priceCents, to: prop.priceCents }, tx);
  });
  await notify(prop.proposedById, "price.decision", approve ? "Prix validé" : "Prix refusé",
    `${approve ? "Le nouveau prix est appliqué" : "Le propriétaire a refusé le prix proposé"} pour « ${prop.product.title} ».`, `/collaborations/${prop.contractId}`);
}

// ───────────── Matching ─────────────

const dept = (pc?: string | null) => (pc ? pc.slice(0, 2) : null);

/** Score de pertinence (0–100) entre un indépendant et une demande / un fournisseur / un produit. */
export function matchScore(pro: { categorySlugs: string[]; serviceArea?: string | null; postalCode?: string | null; offersPickup?: boolean },
  target: { categorySlugs: string[]; city?: string | null; postalCode?: string | null; mode?: string; estimatedItems?: number }) {
  let score = 0;
  const overlap = target.categorySlugs.filter((c) => pro.categorySlugs.includes(c)).length;
  if (target.categorySlugs.length) score += Math.round((overlap / target.categorySlugs.length) * 50);
  if (pro.serviceArea && target.city && pro.serviceArea.toLowerCase() === target.city.toLowerCase()) score += 30;
  else if (dept(pro.postalCode) && dept(pro.postalCode) === dept(target.postalCode)) score += 20;
  if (target.mode === "FULL_SERVICE") score += pro.offersPickup ? 10 : -20;
  if (target.estimatedItems) score += Math.min(10, Math.round(Math.log10(target.estimatedItems + 1) * 6));
  return Math.max(0, Math.min(100, score));
}
