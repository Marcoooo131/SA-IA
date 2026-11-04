"use server";
import { revalidatePath } from "next/cache";
import { safeAction, str } from "@/lib/actions";
import { requireActor } from "@/server/auth/session";
import { selectSupplierProduct, unselectSupplierProduct } from "@/server/services/affiliate";

export const selectAction = safeAction(async (fd) => {
  const a = await requireActor();
  await selectSupplierProduct(a, str(fd, "productId"));
  revalidatePath("/pro/catalogue"); revalidatePath("/pro/liens");
  return { ok: "Ajouté à votre sélection : votre lien est prêt" };
});
export const unselectAction = safeAction(async (fd) => {
  const a = await requireActor();
  await unselectSupplierProduct(a, str(fd, "productId"));
  revalidatePath("/pro/catalogue"); revalidatePath("/pro/liens");
  return { ok: "Retiré de votre sélection" };
});
