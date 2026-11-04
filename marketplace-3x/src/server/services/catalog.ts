import { z } from "zod";
import type { Prisma, ProductCondition } from "@prisma/client";
import { db } from "../db";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import type { Actor } from "../auth/actor";
import { assertActive, assertRole } from "../auth/permissions";
import { getCommerceSettings } from "../settings";
import { effectiveSupplierBps, isWithinBounds } from "../commission/engine";
import { audit } from "../audit";
import { notify } from "./notifications";
import { formatBps } from "@/lib/money";

// ───────────── Recherche ─────────────

export const searchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().max(60).optional(),
  min: z.coerce.number().int().min(0).optional(),
  max: z.coerce.number().int().min(0).optional(),
  condition: z.enum(["NEW", "LIKE_NEW", "VERY_GOOD", "GOOD", "FAIR"]).optional(),
  state: z.enum(["new", "used"]).optional(),
  city: z.string().trim().max(60).optional(),
  brand: z.string().trim().max(60).optional(),
  seller: z.enum(["individual", "supplier", "professional"]).optional(),
  delivery: z.enum(["shipping", "pickup"]).optional(),
  since: z.coerce.number().int().min(1).max(365).optional(),
  sort: z.enum(["recent", "price_asc", "price_desc", "popular"]).optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
});
export type SearchParams = z.infer<typeof searchSchema>;

export const PAGE_SIZE = 24;

export const publicProductInclude = {
  images: { orderBy: { position: "asc" }, take: 1 },
  category: true,
  owner: { select: { id: true, displayName: true, city: true, primaryRole: true, supplierProfile: { select: { companyName: true, verificationStatus: true } } } },
  contract: { select: { status: true, professional: { select: { id: true, displayName: true } } } },
} satisfies Prisma.ProductInclude;

export async function publicVisibilityWhere(): Promise<Prisma.ProductWhereInput> {
  const s = await getCommerceSettings();
  return {
    status: "ACTIVE",
    owner: { status: "ACTIVE" },
    ...(s.requireVerifiedSupplier
      ? { OR: [{ sellerKind: "INDIVIDUAL" }, { owner: { supplierProfile: { verificationStatus: "VERIFIED" } } }] }
      : {}),
  };
}

export async function searchProducts(raw: unknown) {
  const p = searchSchema.parse(raw);
  const and: Prisma.ProductWhereInput[] = [await publicVisibilityWhere()];
  if (p.q) {
    const words = p.q.split(/\s+/).filter(Boolean).slice(0, 6);
    for (const w of words) {
      and.push({ OR: [
        { title: { contains: w, mode: "insensitive" } },
        { description: { contains: w, mode: "insensitive" } },
        { brand: { contains: w, mode: "insensitive" } },
      ] });
    }
  }
  if (p.category) {
    const cat = await db.category.findUnique({ where: { slug: p.category }, include: { children: true } });
    if (cat) and.push({ categoryId: { in: [cat.id, ...cat.children.map((c) => c.id)] } });
  }
  if (p.min != null) and.push({ priceCents: { gte: p.min * 100 } });
  if (p.max != null) and.push({ priceCents: { lte: p.max * 100 } });
  if (p.condition) and.push({ condition: p.condition });
  if (p.state === "new") and.push({ condition: "NEW" });
  if (p.state === "used") and.push({ condition: { not: "NEW" } });
  if (p.city) and.push({ OR: [{ city: { contains: p.city, mode: "insensitive" } }, { postalCode: { startsWith: p.city } }] });
  if (p.brand) and.push({ brand: { contains: p.brand, mode: "insensitive" } });
  if (p.seller === "individual") and.push({ sellerKind: "INDIVIDUAL", contractId: null });
  if (p.seller === "supplier") and.push({ sellerKind: "SUPPLIER" });
  if (p.seller === "professional") and.push({ contract: { status: "ACTIVE" } });
  if (p.delivery === "pickup") and.push({ handPickup: true });
  if (p.delivery === "shipping") and.push({ NOT: { shippingMethods: { isEmpty: true } } });
  if (p.since) and.push({ publishedAt: { gte: new Date(Date.now() - p.since * 86400e3) } });

  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    p.sort === "price_asc" ? [{ priceCents: "asc" }] :
    p.sort === "price_desc" ? [{ priceCents: "desc" }] :
    p.sort === "popular" ? [{ viewCount: "desc" }, { publishedAt: "desc" }] : [{ publishedAt: "desc" }];

  const page = p.page ?? 1;
  const where: Prisma.ProductWhereInput = { AND: and };
  const [items, total] = await Promise.all([
    db.product.findMany({ where, orderBy, include: publicProductInclude, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    db.product.count({ where }),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), params: p };
}

export async function getPublicProduct(id: string) {
  const product = await db.product.findUnique({
    where: { id },
    include: {
      images: { orderBy: { position: "asc" } },
      category: { include: { parent: true } },
      variants: { include: { inventory: true } },
      inventory: true,
      commissionRules: { where: { active: true }, orderBy: { createdAt: "desc" }, take: 1 },
      owner: {
        select: {
          id: true, displayName: true, city: true, createdAt: true, primaryRole: true, avatarUrl: true,
          supplierProfile: { select: { companyName: true, verificationStatus: true, defaultShippingDays: true } },
        },
      },
      contract: { include: { professional: { select: { id: true, displayName: true, professionalProfile: true } } } },
    },
  });
  return product;
}

export async function similarProducts(product: { id: string; categoryId: string; priceCents: number }, take = 8) {
  return db.product.findMany({
    where: {
      AND: [await publicVisibilityWhere(), { id: { not: product.id }, categoryId: product.categoryId },
        { priceCents: { gte: Math.floor(product.priceCents * 0.4), lte: Math.ceil(product.priceCents * 2) } }],
    },
    include: publicProductInclude, orderBy: { viewCount: "desc" }, take,
  });
}

/** Recommandations personnalisées : catégories des favoris et des achats. */
export async function recommendationsFor(userId: string, take = 8) {
  const favs = await db.favorite.findMany({ where: { userId }, include: { product: { select: { categoryId: true } } }, take: 50 });
  const cats = [...new Set(favs.map((f) => f.product.categoryId))];
  if (!cats.length) return [];
  return db.product.findMany({
    where: { AND: [await publicVisibilityWhere(), { categoryId: { in: cats }, ownerId: { not: userId }, favorites: { none: { userId } } }] },
    include: publicProductInclude, orderBy: { publishedAt: "desc" }, take,
  });
}

// ───────────── Création / modification ─────────────

const centsField = z.coerce.number().int().min(0).max(100_000_000);
export const productInputSchema = z.object({
  title: z.string().trim().min(3, "Titre trop court").max(120),
  description: z.string().trim().min(10, "Décrivez le produit (10 caractères minimum)").max(5000),
  categoryId: z.string().min(1, "Choisissez une catégorie"),
  brand: z.string().trim().max(60).optional().nullable(),
  condition: z.enum(["NEW", "LIKE_NEW", "VERY_GOOD", "GOOD", "FAIR"]),
  priceCents: centsField.refine((v) => v >= 100, "Prix minimum : 1 €"),
  minPriceCents: centsField.optional().nullable(),
  recommendedPriceCents: centsField.optional().nullable(),
  wholesalePriceCents: centsField.optional().nullable(),
  shippingCents: centsField.default(0),
  shippingDays: z.coerce.number().int().min(0).max(60).default(3),
  shippingMethods: z.array(z.string()).max(6).default([]),
  handPickup: z.boolean().default(false),
  city: z.string().trim().max(80).optional().nullable(),
  postalCode: z.string().trim().max(10).optional().nullable(),
  openToProfessionals: z.boolean().default(false),
  affiliateEnabled: z.boolean().default(false),
  sku: z.string().trim().max(60).optional().nullable(),
  stock: z.coerce.number().int().min(0).max(1_000_000).default(1),
  variants: z.array(z.object({ name: z.string().trim().min(1).max(60), stock: z.coerce.number().int().min(0), priceCents: centsField.optional().nullable(), sku: z.string().optional().nullable() })).max(50).default([]),
  commission: z.object({ type: z.enum(["PERCENT", "FIXED"]), value: z.coerce.number().int().min(0) }).optional().nullable(),
  imageUrls: z.array(z.string()).max(10).default([]),
  publish: z.boolean().default(true),
});
export type ProductInput = z.infer<typeof productInputSchema>;

/** Contrôle DSA : mots-clés interdits et catégories réglementées → modération humaine. */
export async function moderationVerdict(input: { title: string; description: string; categoryId: string }) {
  const s = await getCommerceSettings();
  const text = `${input.title} ${input.description}`.toLowerCase();
  const hit = s.prohibitedKeywords.find((k) => text.includes(k.toLowerCase()));
  if (hit) return { status: "PENDING_REVIEW" as const, note: `Mot-clé surveillé : « ${hit} »` };
  const cat = await db.category.findUnique({ where: { id: input.categoryId } });
  if (!cat) throw new AppError("Catégorie inconnue");
  if (cat.restricted) return { status: "PENDING_REVIEW" as const, note: "Catégorie soumise à contrôle" };
  if (s.requireModeration) return { status: "PENDING_REVIEW" as const, note: "Modération systématique activée" };
  return { status: "ACTIVE" as const, note: null };
}

async function validateSupplierCommission(input: ProductInput) {
  if (!input.affiliateEnabled) return;
  if (!input.commission) throw new AppError("Définissez la commission proposée aux indépendants");
  const s = await getCommerceSettings();
  const eff = effectiveSupplierBps(input.commission, input.priceCents);
  if (!isWithinBounds(eff, s.supplierCommissionMinBps, s.supplierCommissionMaxBps)) {
    throw new AppError(`La commission doit représenter entre ${formatBps(s.supplierCommissionMinBps)} et ${formatBps(s.supplierCommissionMaxBps)} du prix`);
  }
}

export async function createProduct(actor: Actor, raw: unknown) {
  assertRole(actor, "INDIVIDUAL", "SUPPLIER");
  const input = productInputSchema.parse(raw);
  const isSupplier = actor.primaryRole === "SUPPLIER";
  if (!isSupplier) {
    input.affiliateEnabled = false; input.commission = null; input.variants = []; input.stock = 1;
    input.wholesalePriceCents = null; input.recommendedPriceCents = null;
  }
  if (input.minPriceCents != null && input.minPriceCents > input.priceCents) throw new AppError("Le prix plancher dépasse le prix affiché");
  await validateSupplierCommission(input);
  const verdict = input.publish ? await moderationVerdict(input) : { status: "DRAFT" as const, note: null };
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });

  const product = await db.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        ownerId: actor.id, sellerKind: isSupplier ? "SUPPLIER" : "INDIVIDUAL", categoryId: input.categoryId,
        title: input.title, description: input.description, brand: input.brand || null, condition: input.condition as ProductCondition,
        priceCents: input.priceCents, minPriceCents: input.minPriceCents ?? null,
        recommendedPriceCents: input.recommendedPriceCents ?? null, wholesalePriceCents: input.wholesalePriceCents ?? null,
        shippingCents: input.shippingCents, shippingDays: input.shippingDays, shippingMethods: input.shippingMethods,
        handPickup: input.handPickup, city: input.city || user.city, postalCode: input.postalCode || user.postalCode,
        openToProfessionals: !isSupplier && input.openToProfessionals, affiliateEnabled: isSupplier && input.affiliateEnabled,
        sku: input.sku || null, status: verdict.status, moderationNote: verdict.note,
        publishedAt: verdict.status === "ACTIVE" ? new Date() : null,
        images: { create: input.imageUrls.map((url, i) => ({ url, position: i, alt: input.title })) },
      },
    });
    if (input.variants.length) {
      for (const v of input.variants) {
        const variant = await tx.productVariant.create({ data: { productId: p.id, name: v.name, sku: v.sku || null, priceCents: v.priceCents ?? null } });
        await tx.inventory.create({ data: { productId: p.id, variantId: variant.id, quantity: v.stock } });
      }
    } else {
      await tx.inventory.create({ data: { productId: p.id, quantity: input.stock } });
    }
    if (isSupplier && input.commission) {
      await tx.commissionRule.create({ data: { productId: p.id, type: input.commission.type, value: input.commission.value } });
    }
    await audit(actor.id, "product.create", "Product", p.id, { status: verdict.status }, tx);
    return p;
  });
  if (product.status === "ACTIVE") await fireSearchAlerts(product.id);
  return product;
}

/** Champs modifiables par un indépendant sur un produit confié (le prix passe par une proposition). */
const proEditable = productInputSchema.pick({ title: true, description: true, brand: true, imageUrls: true });

export async function canManageProduct(actor: Actor, productId: string) {
  const p = await db.product.findUnique({ where: { id: productId }, include: { contract: true } });
  if (!p) throw new NotFoundError();
  if (p.ownerId === actor.id) return { product: p, as: "owner" as const };
  if (p.contract && p.contract.status === "ACTIVE" && p.contract.professionalId === actor.id) return { product: p, as: "professional" as const };
  if (actor.roles.includes("ADMIN")) return { product: p, as: "admin" as const };
  throw new ForbiddenError();
}

export async function updateProduct(actor: Actor, productId: string, raw: unknown) {
  assertActive(actor);
  const { product, as } = await canManageProduct(actor, productId);
  if (as === "professional") {
    const input = proEditable.parse(raw);
    await db.$transaction(async (tx) => {
      await tx.product.update({ where: { id: productId }, data: { title: input.title, description: input.description, brand: input.brand || null } });
      if (input.imageUrls.length) {
        await tx.productImage.deleteMany({ where: { productId } });
        await tx.productImage.createMany({ data: input.imageUrls.map((url, i) => ({ productId, url, position: i, alt: input.title })) });
      }
      await audit(actor.id, "product.update_by_professional", "Product", productId, { fields: ["title", "description", "brand", ...(input.imageUrls.length ? ["images"] : [])] }, tx);
    });
    await notify(product.ownerId, "moderation", "Annonce mise à jour par votre indépendant", `« ${input.title} » a été modifiée par l'indépendant qui la commercialise.`, `/espace/annonces/${productId}`);
    return;
  }
  const input = productInputSchema.parse(raw);
  if (product.sellerKind === "INDIVIDUAL") { input.affiliateEnabled = false; input.commission = null; }
  if (input.minPriceCents != null && input.minPriceCents > input.priceCents) throw new AppError("Le prix plancher dépasse le prix affiché");
  await validateSupplierCommission(input);
  const contentChanged = input.title !== product.title || input.description !== product.description || input.categoryId !== product.categoryId;
  const verdict = contentChanged && product.status === "ACTIVE" ? await moderationVerdict(input) : null;

  await db.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: {
        title: input.title, description: input.description, categoryId: input.categoryId, brand: input.brand || null,
        condition: input.condition, priceCents: input.priceCents, minPriceCents: input.minPriceCents ?? null,
        recommendedPriceCents: input.recommendedPriceCents ?? null, wholesalePriceCents: input.wholesalePriceCents ?? null,
        shippingCents: input.shippingCents, shippingDays: input.shippingDays, shippingMethods: input.shippingMethods,
        handPickup: input.handPickup, city: input.city || null, postalCode: input.postalCode || null,
        openToProfessionals: product.sellerKind === "INDIVIDUAL" && input.openToProfessionals,
        affiliateEnabled: product.sellerKind === "SUPPLIER" && input.affiliateEnabled, sku: input.sku || null,
        ...(verdict && verdict.status !== "ACTIVE" ? { status: verdict.status, moderationNote: verdict.note } : {}),
      },
    });
    if (input.imageUrls.length) {
      await tx.productImage.deleteMany({ where: { productId } });
      await tx.productImage.createMany({ data: input.imageUrls.map((url, i) => ({ productId, url, position: i, alt: input.title })) });
    }
    if (product.sellerKind === "SUPPLIER") {
      if (input.commission && input.affiliateEnabled) {
        const current = await tx.commissionRule.findFirst({ where: { productId, active: true } });
        if (!current || current.type !== input.commission.type || current.value !== input.commission.value) {
          // Historisation : on désactive l'ancienne règle (les commandes passées gardent leur taux figé).
          await tx.commissionRule.updateMany({ where: { productId, active: true }, data: { active: false } });
          await tx.commissionRule.create({ data: { productId, type: input.commission.type, value: input.commission.value } });
        }
      }
      if (!input.variants.length) {
        const inv = await tx.inventory.findFirst({ where: { productId, variantId: null } });
        if (inv) await tx.inventory.update({ where: { id: inv.id }, data: { quantity: input.stock } });
        else await tx.inventory.create({ data: { productId, quantity: input.stock } });
        if (input.stock > 0) await tx.product.updateMany({ where: { id: productId, status: "SOLD_OUT" }, data: { status: "ACTIVE" } });
      } else {
        for (const v of input.variants) {
          const existing = await tx.productVariant.findFirst({ where: { productId, name: v.name } });
          const variant = existing
            ? await tx.productVariant.update({ where: { id: existing.id }, data: { priceCents: v.priceCents ?? null, sku: v.sku || null } })
            : await tx.productVariant.create({ data: { productId, name: v.name, priceCents: v.priceCents ?? null, sku: v.sku || null } });
          await tx.inventory.upsert({ where: { variantId: variant.id }, create: { productId, variantId: variant.id, quantity: v.stock }, update: { quantity: v.stock } });
        }
      }
    }
    await audit(actor.id, "product.update", "Product", productId, { priceCents: input.priceCents }, tx);
  });
}

export async function setProductStatus(actor: Actor, productId: string, action: "pause" | "resume" | "remove" | "publish") {
  const { product, as } = await canManageProduct(actor, productId);
  if (as === "professional") throw new ForbiddenError("Seul le propriétaire peut changer le statut de l'annonce");
  if (product.status === "REMOVED" && as !== "admin") throw new AppError("Annonce retirée par la modération");
  let status = product.status;
  if (action === "pause") status = "PAUSED";
  if (action === "remove") status = "REMOVED";
  if (action === "resume" || action === "publish") {
    if (product.status === "PENDING_REVIEW") throw new AppError("Annonce en cours de modération");
    const verdict = action === "publish" ? await moderationVerdict(product) : { status: "ACTIVE" as const };
    const stock = await db.inventory.aggregate({ where: { productId }, _sum: { quantity: true } });
    status = (stock._sum.quantity ?? 0) > 0 ? verdict.status : "SOLD_OUT";
  }
  await db.product.update({ where: { id: productId }, data: { status, publishedAt: status === "ACTIVE" && !product.publishedAt ? new Date() : undefined } });
  await audit(actor.id, `product.${action}`, "Product", productId);
  if (status === "ACTIVE" && !product.publishedAt) await fireSearchAlerts(productId);
}

// ───────────── Favoris & alertes ─────────────

export async function toggleFavorite(actor: Actor, productId: string) {
  assertActive(actor);
  const key = { userId_productId: { userId: actor.id, productId } };
  const existing = await db.favorite.findUnique({ where: key });
  if (existing) { await db.favorite.delete({ where: key }); return false; }
  await db.favorite.create({ data: { userId: actor.id, productId } });
  return true;
}

export async function saveSearch(actor: Actor, label: string, params: SearchParams) {
  assertActive(actor);
  const count = await db.savedSearch.count({ where: { userId: actor.id } });
  if (count >= 20) throw new AppError("20 alertes maximum");
  return db.savedSearch.create({ data: { userId: actor.id, label: label.slice(0, 80), query: params.q ?? null, filters: params } });
}

/** À la publication d'un produit : prévient les acheteurs dont l'alerte correspond. */
export async function fireSearchAlerts(productId: string) {
  const p = await db.product.findUnique({ where: { id: productId }, include: { category: true } });
  if (!p || p.status !== "ACTIVE") return 0;
  const searches = await db.savedSearch.findMany({ where: { userId: { not: p.ownerId } }, take: 2000 });
  let n = 0;
  for (const s of searches) {
    const f = s.filters as SearchParams;
    const text = `${p.title} ${p.description} ${p.brand ?? ""}`.toLowerCase();
    if (f.q && !f.q.toLowerCase().split(/\s+/).every((w) => text.includes(w))) continue;
    if (f.category && f.category !== p.category.slug) continue;
    if (f.max != null && p.priceCents > f.max * 100) continue;
    if (f.min != null && p.priceCents < f.min * 100) continue;
    if (f.state === "new" && p.condition !== "NEW") continue;
    if (f.state === "used" && p.condition === "NEW") continue;
    await notify(s.userId, "search.alert", `Alerte « ${s.label} »`, `Nouvelle annonce : ${p.title}`, `/produit/${p.id}`);
    await db.savedSearch.update({ where: { id: s.id }, data: { lastNotifiedAt: new Date() } });
    n++;
  }
  return n;
}

// ───────────── Offres de prix (négociation) ─────────────

export async function makeProductOffer(actor: Actor, productId: string, amountCents: number, message?: string) {
  assertActive(actor);
  const p = await db.product.findUnique({ where: { id: productId }, include: { contract: true } });
  if (!p || p.status !== "ACTIVE") throw new AppError("Annonce indisponible");
  if (p.ownerId === actor.id) throw new AppError("Vous ne pouvez pas faire d'offre sur votre propre annonce");
  if (p.sellerKind === "SUPPLIER") throw new AppError("Les produits fournisseurs sont à prix fixe");
  if (!Number.isInteger(amountCents) || amountCents < 100 || amountCents >= p.priceCents) throw new AppError("L'offre doit être inférieure au prix affiché");
  const pending = await db.productOffer.count({ where: { productId, buyerId: actor.id, status: "PENDING" } });
  if (pending) throw new AppError("Vous avez déjà une offre en attente sur cette annonce");
  const offer = await db.productOffer.create({ data: { productId, buyerId: actor.id, amountCents, message: message?.slice(0, 500) } });
  const handler = p.contract?.status === "ACTIVE" ? p.contract.professionalId : p.ownerId;
  await notify(handler, "offer.new", "Nouvelle offre reçue", `Une offre a été faite sur « ${p.title} ».`, p.contract ? "/pro/ventes" : "/espace/offres");
  return offer;
}

/**
 * Décision sur une offre : le propriétaire, ou l'indépendant mandaté — ce dernier ne peut
 * accepter qu'au-dessus du prix plancher fixé par le propriétaire.
 */
export async function decideProductOffer(actor: Actor, offerId: string, accept: boolean) {
  const offer = await db.productOffer.findUnique({ where: { id: offerId }, include: { product: { include: { contract: true } } } });
  if (!offer || offer.status !== "PENDING") throw new AppError("Offre introuvable ou déjà traitée");
  const p = offer.product;
  const isOwner = p.ownerId === actor.id;
  const isPro = p.contract?.status === "ACTIVE" && p.contract.professionalId === actor.id;
  if (!isOwner && !isPro) throw new ForbiddenError();
  if (accept && isPro && (p.minPriceCents == null || offer.amountCents < p.minPriceCents)) {
    throw new AppError("Montant inférieur au prix plancher validé par le propriétaire : seule sa validation est possible");
  }
  await db.productOffer.update({ where: { id: offerId }, data: { status: accept ? "ACCEPTED" : "DECLINED", decidedById: actor.id, decidedAt: new Date() } });
  await audit(actor.id, accept ? "offer.accept" : "offer.decline", "ProductOffer", offerId, { amountCents: offer.amountCents });
  await notify(offer.buyerId, "offer.decision", accept ? "Offre acceptée" : "Offre refusée",
    accept ? `Votre offre sur « ${p.title} » est acceptée : vous pouvez l'acheter au prix négocié.` : `Votre offre sur « ${p.title} » n'a pas été retenue.`, `/produit/${p.id}`);
}
