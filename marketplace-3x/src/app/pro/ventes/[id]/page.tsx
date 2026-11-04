import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCommerceSettings } from "@/server/settings";
import { Alert, PageHeader } from "@/components/ui";
import { ProductForm } from "@/components/product/ProductForm";

export default async function ProEdit({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const p = await db.product.findUnique({ where: { id }, include: { images: { orderBy: { position: "asc" } }, variants: { include: { inventory: true } }, inventory: true, commissionRules: true, contract: true } });
  if (!p || p.contract?.professionalId !== actor.id || p.contract.status !== "ACTIVE") notFound();
  const [categories, settings] = await Promise.all([db.category.findMany(), getCommerceSettings()]);
  return (
    <>
      <PageHeader title="Retravailler l'annonce" subtitle={p.title} />
      <div className="mb-4"><Alert tone="info">Vous pouvez améliorer les photos, le titre et la description. Le prix se modifie par une proposition validée par le propriétaire (page collaboration). Chaque modification est visible du propriétaire.</Alert></div>
      <ProductForm categories={categories} settings={settings} product={p} proMode />
    </>
  );
}
