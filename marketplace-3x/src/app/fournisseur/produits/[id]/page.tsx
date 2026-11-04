import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCommerceSettings } from "@/server/settings";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "@/components/product/ProductForm";

export default async function EditSupplierProduct({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const p = await db.product.findUnique({ where: { id }, include: { images: { orderBy: { position: "asc" } }, variants: { include: { inventory: true } }, inventory: true, commissionRules: true } });
  if (!p || p.ownerId !== actor.id) notFound();
  const [categories, settings] = await Promise.all([db.category.findMany({ orderBy: { position: "asc" } }), getCommerceSettings()]);
  return (<><PageHeader title="Modifier le produit" subtitle="Une nouvelle commission s'applique aux futures commandes ; les commandes passées conservent le taux figé." /><ProductForm categories={categories} settings={settings} product={p} supplier /></>);
}
