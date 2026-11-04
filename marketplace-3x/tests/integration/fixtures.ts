import type { Role } from "@prisma/client";
import { db } from "@/server/db";
import { loadActor, makeCode } from "@/server/services/auth";
import { createProduct } from "@/server/services/catalog";
import { addToCart, checkout } from "@/server/services/orders";

let n = 0;
export async function makeUser(role: Role, opts: { verified?: boolean; city?: string } = {}) {
  n++;
  const u = await db.user.create({
    data: {
      email: `u${n}-${Date.now()}@test.local`, displayName: `${role} ${n}`, primaryRole: role, passwordHash: "x",
      referralCode: makeCode("T"), emailVerifiedAt: new Date(), city: opts.city,
      roles: { create: [{ role }, ...(role !== "INDIVIDUAL" && role !== "ADMIN" ? [{ role: "INDIVIDUAL" as Role }] : [])] },
    },
  });
  if (role === "PROFESSIONAL") {
    await db.professionalProfile.create({ data: { userId: u.id, refCode: makeCode("REF"), categorySlugs: ["tech"], verificationStatus: opts.verified === false ? "PENDING" : "VERIFIED" } });
  }
  if (role === "SUPPLIER") {
    await db.supplierProfile.create({ data: { userId: u.id, companyName: `Fournisseur ${n}`, verificationStatus: opts.verified === false ? "PENDING" : "VERIFIED" } });
  }
  return (await loadActor(u.id))!;
}

export async function category() {
  return db.category.upsert({ where: { slug: "tech" }, create: { slug: "tech", name: "Tech" }, update: {} });
}

export async function individualProduct(owner: Awaited<ReturnType<typeof makeUser>>, priceEuros = 100, extra: Record<string, unknown> = {}) {
  const c = await category();
  return createProduct(owner, { title: "Produit de test", description: "Description suffisamment longue", categoryId: c.id, condition: "GOOD", priceCents: priceEuros * 100, shippingCents: 0, ...extra });
}

export async function supplierProduct(owner: Awaited<ReturnType<typeof makeUser>>, priceEuros = 150, stock = 5, commission: { type: "PERCENT" | "FIXED"; value: number } = { type: "FIXED", value: 1500 }) {
  const c = await category();
  return createProduct(owner, {
    title: "Produit fournisseur", description: "Description suffisamment longue", categoryId: c.id, condition: "NEW",
    priceCents: priceEuros * 100, stock, affiliateEnabled: true, commission, shippingCents: 0,
  });
}

export const address = { shippingName: "Test", shippingLine1: "1 rue du Test", shippingPostal: "75001", shippingCity: "Paris", acceptTerms: true as const };

export async function buy(buyer: Awaited<ReturnType<typeof makeUser>>, productId: string, opts: { attributionIds?: string[]; quantity?: number; promoCode?: string } = {}) {
  await addToCart(buyer, { productId, attributionIds: opts.attributionIds, quantity: opts.quantity });
  return checkout(buyer, { ...address, promoCode: opts.promoCode }, "http://localhost:3000");
}

export async function commissionsOfPayment(paymentId: string) {
  return db.commissionTransaction.findMany({ where: { orderItem: { order: { paymentId } } }, orderBy: { kind: "asc" } });
}
