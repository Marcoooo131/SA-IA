import { notFound } from "next/navigation";
import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCommerceSettings } from "@/server/settings";
import { Alert, PageHeader } from "@/components/ui";
import { ProductForm } from "@/components/product/ProductForm";
import { productStatusLabel } from "@/lib/labels";

export default async function EditListing({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const p = await db.product.findUnique({ where: { id }, include: { images: { orderBy: { position: "asc" } }, variants: { include: { inventory: true } }, inventory: true, commissionRules: true, contract: { include: { professional: true } } } });
  if (!p || (p.ownerId !== actor.id && !actor.roles.includes("ADMIN"))) notFound();
  const [categories, settings] = await Promise.all([db.category.findMany({ orderBy: { position: "asc" } }), getCommerceSettings()]);
  return (
    <>
      <PageHeader title="Modifier l'annonce" subtitle={`Statut : ${productStatusLabel[p.status]}`} action={<Link href={`/produit/${p.id}`} className="text-sm underline">Voir l&apos;annonce</Link>} />
      {p.moderationNote && <div className="mb-4"><Alert tone="warning" title="Note de modération">{p.moderationNote}</Alert></div>}
      {p.contract?.status === "ACTIVE" && <div className="mb-4"><Alert tone="info">Cet article est confié à <Link className="underline" href={`/collaborations/${p.contract.id}`}>{p.contract.professional.displayName}</Link>. Vous gardez la main sur le prix et le prix plancher.</Alert></div>}
      <ProductForm categories={categories} settings={settings} product={p} supplier={p.sellerKind === "SUPPLIER"} />
    </>
  );
}
