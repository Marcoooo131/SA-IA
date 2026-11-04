"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeAction, str } from "@/lib/actions";
import { getActor, requireActor } from "@/server/auth/session";
import { toggleFavorite, makeProductOffer, decideProductOffer, saveSearch, searchSchema } from "@/server/services/catalog";
import { addToCart, updateCartItem, checkout } from "@/server/services/orders";
import { createReport } from "@/server/services/admin";
import { startConversation } from "@/server/services/messaging";
import { db } from "@/server/db";
import { readConsent, readRefCookie, REF_COOKIE } from "@/server/consent";
import { parseEurosToCents } from "@/lib/money";
import { AppError } from "@/server/errors";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

export const favoriteAction = safeAction(async (fd) => {
  const actor = await getActor();
  if (!actor) redirect(`/connexion?next=/produit/${str(fd, "productId")}`);
  const on = await toggleFavorite(actor, str(fd, "productId"));
  revalidatePath("/", "layout");
  return { ok: on ? "Ajouté aux favoris" : "Retiré des favoris" };
});

export const addToCartAction = safeAction(async (fd) => {
  const productId = str(fd, "productId");
  const actor = await getActor();
  if (!actor) redirect(`/connexion?next=/produit/${productId}`);
  const fromUrl = str(fd, "attributionId");
  const attributionIds = [...(fromUrl ? [fromUrl] : []), ...(await readRefCookie())];
  await addToCart(actor, { productId, variantId: str(fd, "variantId") || null, quantity: Number(str(fd, "quantity") || 1), attributionIds });
  if (str(fd, "buyNow")) redirect("/commande");
  revalidatePath("/", "layout");
  return { ok: "Ajouté au panier" };
});

/** Mémorise une attribution dans un cookie — seulement si le visiteur y a consenti. */
export async function rememberAttribution(attributionId: string) {
  const consent = await readConsent();
  if (!consent?.affiliate || !/^[a-z0-9]{20,40}$/.test(attributionId)) return;
  const list = [attributionId, ...(await readRefCookie()).filter((x) => x !== attributionId)].slice(0, 20);
  (await cookies()).set(REF_COOKIE, list.join("."), { path: "/", httpOnly: true, sameSite: "lax", maxAge: 30 * 86400, secure: process.env.NODE_ENV === "production" });
}

export const cartQtyAction = safeAction(async (fd) => {
  const actor = await requireActor("/panier");
  await updateCartItem(actor, str(fd, "itemId"), Number(str(fd, "quantity")));
  revalidatePath("/panier");
  return { ok: "Panier mis à jour" };
});

export const checkoutAction = safeAction(async (fd) => {
  const actor = await requireActor("/commande");
  const res = await checkout(actor, {
    shippingName: str(fd, "shippingName"), shippingLine1: str(fd, "shippingLine1"), shippingLine2: str(fd, "shippingLine2"),
    shippingPostal: str(fd, "shippingPostal"), shippingCity: str(fd, "shippingCity"), carrier: str(fd, "carrier"),
    promoCode: str(fd, "promoCode") || null, acceptTerms: fd.get("acceptTerms") === "on" || undefined,
  }, appUrl());
  redirect(res.redirectUrl);
});

export const offerAction = safeAction(async (fd) => {
  const productId = str(fd, "productId");
  const actor = await getActor();
  if (!actor) redirect(`/connexion?next=/produit/${productId}`);
  await makeProductOffer(actor, productId, parseEurosToCents(str(fd, "amount")), str(fd, "message"));
  return { ok: "Offre envoyée au vendeur" };
});

export const decideOfferAction = safeAction(async (fd) => {
  const actor = await requireActor();
  await decideProductOffer(actor, str(fd, "offerId"), str(fd, "decision") === "accept");
  revalidatePath("/espace/offres"); revalidatePath("/pro/ventes");
  return { ok: "Décision enregistrée" };
});

export const contactAction = safeAction(async (fd) => {
  const actor = await getActor();
  const productId = str(fd, "productId") || undefined;
  if (!actor) redirect(`/connexion${productId ? `?next=/produit/${productId}` : ""}`);
  const to = str(fd, "to");
  const orderId = str(fd, "orderId") || undefined;
  const conv = await startConversation(actor, to, str(fd, "subject") || "Question", str(fd, "body"), orderId ? { orderId } : productId ? { productId } : {});
  redirect(`/messages/${conv.id}`);
});

export const reportAction = safeAction(async (fd) => {
  const actor = await getActor();
  const type = str(fd, "targetType");
  if (!["PRODUCT", "USER", "MESSAGE"].includes(type)) throw new AppError("Signalement invalide");
  await createReport(actor, { targetType: type as "PRODUCT", targetId: str(fd, "targetId"), reason: str(fd, "reason"), details: str(fd, "details") });
  return { ok: "Merci, votre signalement a été transmis à l'équipe de modération." };
});

export const saveSearchAction = safeAction(async (fd) => {
  const actor = await getActor();
  if (!actor) redirect("/connexion?next=/recherche");
  const params = searchSchema.parse(JSON.parse(str(fd, "params") || "{}"));
  await saveSearch(actor, str(fd, "label") || params.q || "Ma recherche", params);
  return { ok: "Alerte créée : vous serez prévenu des nouvelles annonces." };
});

export const deleteSearchAction = safeAction(async (fd) => {
  const actor = await requireActor();
  await db.savedSearch.deleteMany({ where: { id: str(fd, "id"), userId: actor.id } });
  revalidatePath("/espace/alertes");
  return { ok: "Alerte supprimée" };
});
