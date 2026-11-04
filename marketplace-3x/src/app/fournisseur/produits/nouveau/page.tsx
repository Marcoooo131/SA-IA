import { db } from "@/server/db";
import { getCommerceSettings } from "@/server/settings";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "@/components/product/ProductForm";

export default async function NewSupplierProduct() {
  const [categories, settings] = await Promise.all([db.category.findMany({ orderBy: { position: "asc" } }), getCommerceSettings()]);
  return (<><PageHeader title="Ajouter un produit" subtitle="Définissez prix, stock, variantes, livraison et la commission proposée aux indépendants." /><ProductForm categories={categories} settings={settings} supplier /></>);
}
