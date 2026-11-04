"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeAction, str, bool, files } from "@/lib/actions";
import { requireActor } from "@/server/auth/session";
import { createProduct, updateProduct, setProductStatus } from "@/server/services/catalog";
import { storeImages } from "@/server/storage";
import { parseEurosToCents } from "@/lib/money";
import { importCatalog, parseImportFile } from "@/server/services/import";
import { AppError } from "@/server/errors";

const money = (v: string) => (v ? parseEurosToCents(v) : null);

async function readProductForm(fd: FormData, actorId: string) {
  const uploaded = await storeImages(files(fd, "photos"), `p-${actorId.slice(-6)}`);
  const kept = fd.getAll("keepImages").map(String).filter((u) => u.startsWith("/"));
  const variants = str(fd, "variants").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, stock, price] = l.split(";").map((x) => x.trim());
    return { name, stock: Number(stock || 0), priceCents: price ? parseEurosToCents(price) : null };
  });
  const commissionValue = str(fd, "commissionValue");
  const commissionType = str(fd, "commissionType") as "PERCENT" | "FIXED";
  return {
    title: str(fd, "title"), description: str(fd, "description"), categoryId: str(fd, "categoryId"), brand: str(fd, "brand") || null,
    condition: str(fd, "condition") || "GOOD", priceCents: money(str(fd, "price")), minPriceCents: money(str(fd, "minPrice")),
    recommendedPriceCents: money(str(fd, "recommendedPrice")), wholesalePriceCents: money(str(fd, "wholesalePrice")),
    shippingCents: money(str(fd, "shipping")) ?? 0, shippingDays: Number(str(fd, "shippingDays") || 3),
    shippingMethods: fd.getAll("shippingMethods").map(String), handPickup: bool(fd, "handPickup"),
    city: str(fd, "city") || null, postalCode: str(fd, "postalCode") || null,
    openToProfessionals: bool(fd, "openToProfessionals"), affiliateEnabled: bool(fd, "affiliateEnabled"),
    sku: str(fd, "sku") || null, stock: Number(str(fd, "stock") || 1), variants,
    commission: commissionValue ? { type: commissionType, value: commissionType === "PERCENT" ? Math.round(Number(commissionValue.replace(",", ".")) * 100) : parseEurosToCents(commissionValue) } : null,
    imageUrls: [...kept, ...uploaded], publish: str(fd, "intent") !== "draft",
  };
}

export const createProductAction = safeAction(async (fd) => {
  const actor = await requireActor();
  const input = await readProductForm(fd, actor.id);
  if (!input.imageUrls.length) throw new AppError("Ajoutez au moins une photo");
  const p = await createProduct(actor, input);
  redirect(`${actor.primaryRole === "SUPPLIER" ? "/fournisseur/produits" : "/espace/annonces"}?ok=publie&id=${p.id}`);
});

export const updateProductAction = safeAction(async (fd) => {
  const actor = await requireActor();
  const id = str(fd, "productId");
  await updateProduct(actor, id, await readProductForm(fd, actor.id));
  revalidatePath(`/produit/${id}`);
  return { ok: "Modifications enregistrées" };
});

export const productStatusAction = safeAction(async (fd) => {
  const actor = await requireActor();
  await setProductStatus(actor, str(fd, "productId"), str(fd, "action") as "pause");
  revalidatePath("/espace/annonces"); revalidatePath("/fournisseur/produits");
  return { ok: "Statut mis à jour" };
});

export const importAction = safeAction(async (fd) => {
  const actor = await requireActor();
  const file = files(fd, "file")[0];
  if (!file) throw new AppError("Choisissez un fichier");
  const rows = await parseImportFile(file);
  if (!rows.length) throw new AppError("Aucune ligne trouvée");
  const res = await importCatalog(actor, rows);
  revalidatePath("/fournisseur/produits");
  const errs = res.errors.slice(0, 15).map((e) => `ligne ${e.line} : ${e.message}`).join(" — ");
  if (res.errors.length) return { error: `${res.created} produit(s) importé(s), ${res.errors.length} ligne(s) en erreur : ${errs}` };
  return { ok: `${res.created} produit(s) importé(s) avec succès.` };
});
