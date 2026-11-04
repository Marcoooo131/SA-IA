import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCommerceSettings } from "@/server/settings";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "@/components/product/ProductForm";

export const metadata = { title: "Nouvelle annonce" };
export default async function NewListing() {
  const actor = await requireActor("/espace/annonces/nouvelle");
  if (actor.primaryRole === "SUPPLIER") redirect("/fournisseur/produits/nouveau");
  const [categories, settings] = await Promise.all([db.category.findMany({ orderBy: { position: "asc" } }), getCommerceSettings()]);
  return (<><PageHeader title="Vendre un article" subtitle="Neuf ou d'occasion : décrivez-le honnêtement, l'acheteur paie en ligne et vous êtes payé à la réception." /><ProductForm categories={categories} settings={settings} /></>);
}
