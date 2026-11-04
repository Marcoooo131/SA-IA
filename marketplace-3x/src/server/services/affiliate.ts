import { db } from "../db";
import { AppError } from "../errors";
import type { Actor } from "../auth/actor";
import { assertRole } from "../auth/permissions";
import { getCommerceSettings } from "../settings";
import { audit } from "../audit";

export function affiliateUrl(appUrl: string, productId: string, refCode: string) {
  return `${appUrl}/produit/${productId}?ref=${encodeURIComponent(refCode)}`;
}

export async function assertVerifiedProfessional(actor: Actor) {
  assertRole(actor, "PROFESSIONAL");
  const s = await getCommerceSettings();
  const profile = await db.professionalProfile.findUnique({ where: { userId: actor.id } });
  if (!profile) throw new AppError("Profil professionnel introuvable");
  if (s.requireVerifiedProfessional && profile.verificationStatus !== "VERIFIED") {
    throw new AppError("Votre profil professionnel doit être vérifié par l'équipe avant cette action");
  }
  return profile;
}

/** Sélection d'un produit fournisseur par un indépendant : crée son lien commercial personnel. */
export async function selectSupplierProduct(actor: Actor, productId: string) {
  await assertVerifiedProfessional(actor);
  const p = await db.product.findUnique({ where: { id: productId } });
  if (!p || p.sellerKind !== "SUPPLIER" || !p.affiliateEnabled || p.status !== "ACTIVE") throw new AppError("Produit non ouvert au réseau commercial");
  await db.$transaction([
    db.catalogSelection.upsert({ where: { professionalId_productId: { professionalId: actor.id, productId } }, create: { professionalId: actor.id, productId }, update: {} }),
    db.affiliateLink.upsert({ where: { professionalId_productId: { professionalId: actor.id, productId } }, create: { professionalId: actor.id, productId }, update: {} }),
  ]);
  await audit(actor.id, "catalog.select", "Product", productId);
}

export async function unselectSupplierProduct(actor: Actor, productId: string) {
  assertRole(actor, "PROFESSIONAL");
  await db.catalogSelection.deleteMany({ where: { professionalId: actor.id, productId } });
}

/**
 * Enregistre une visite issue d'un lien `?ref=CODE`. Retourne l'attribution créée, ou null si le
 * lien n'est pas valide (produit non sélectionné, indépendant non vérifié, auto-parrainage).
 * `visitorKey` n'est stocké que si le visiteur a consenti aux traceurs d'affiliation.
 */
export async function recordAffiliateVisit(input: {
  refCode: string; productId: string; visitorKey?: string | null; consented: boolean; userId?: string | null;
}) {
  const s = await getCommerceSettings();
  const profile = await db.professionalProfile.findUnique({ where: { refCode: input.refCode.toUpperCase() } });
  if (!profile || (s.requireVerifiedProfessional && profile.verificationStatus !== "VERIFIED")) return null;
  if (input.userId && input.userId === profile.userId) return null; // pas d'auto-attribution
  const link = await db.affiliateLink.findUnique({ where: { professionalId_productId: { professionalId: profile.userId, productId: input.productId } }, include: { product: true } });
  if (!link || !link.product.affiliateEnabled) return null;
  const [, attribution] = await db.$transaction([
    db.affiliateLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } }),
    db.affiliateAttribution.create({
      data: {
        linkId: link.id, consented: input.consented, visitorKey: input.consented ? input.visitorKey ?? null : null,
        userId: input.userId ?? null, expiresAt: new Date(Date.now() + Math.max(1, s.attributionWindowDays) * 86400e3),
      },
    }),
  ]);
  return attribution;
}

/**
 * Choisit l'attribution applicable à un ajout au panier selon la règle administrée
 * (dernier clic / premier clic) parmi les attributions encore valides pour ce produit.
 */
export async function resolveAttribution(productId: string, candidateIds: string[], buyerId: string) {
  if (!candidateIds.length) return null;
  const s = await getCommerceSettings();
  const rows = await db.affiliateAttribution.findMany({
    where: { id: { in: candidateIds.slice(0, 30) }, expiresAt: { gt: new Date() }, convertedAt: null, link: { productId } },
    include: { link: true },
    orderBy: { createdAt: s.attributionModel === "FIRST_CLICK" ? "asc" : "desc" },
  });
  const valid = rows.filter((r) => r.link.professionalId !== buyerId);
  return valid[0] ?? null;
}
