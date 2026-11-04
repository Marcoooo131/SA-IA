import Image from "next/image";
import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { Badge, ButtonLink, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { ActionButton } from "@/components/ui/Form";
import { productStatusAction } from "@/app/actions/products";
import { productStatusLabel } from "@/lib/labels";
import { formatBps, formatEUR } from "@/lib/money";

export default async function SupplierProducts() {
  const actor = await requireActor();
  const products = await db.product.findMany({ where: { ownerId: actor.id, status: { not: "REMOVED" } }, orderBy: { createdAt: "desc" }, include: { images: { take: 1 }, inventory: true, commissionRules: { where: { active: true }, take: 1 }, _count: { select: { selections: true, variants: true } } } });
  return (
    <>
      <PageHeader title="Catalogue" subtitle={`${products.length} référence(s)`} action={<><ButtonLink href="/fournisseur/produits/nouveau" variant="accent">Ajouter</ButtonLink><ButtonLink href="/fournisseur/import" variant="secondary">Importer</ButtonLink></>} />
      {!products.length ? <EmptyState title="Catalogue vide" action={<ButtonLink href="/fournisseur/import" variant="accent">Importer un fichier</ButtonLink>} /> : (
        <div className="rounded-[var(--radius)] border border-line bg-white"><Table>
          <thead><tr><Th>Produit</Th><Th>Prix</Th><Th>Stock</Th><Th>Commission</Th><Th>Indépendants</Th><Th>Statut</Th><Th /></tr></thead>
          <tbody>{products.map((p) => {
            const stock = p.inventory.reduce((a, i) => a + i.quantity, 0);
            const r = p.commissionRules[0];
            return (
              <tr key={p.id}>
                <Td><div className="flex items-center gap-3"><div className="relative h-11 w-11 overflow-hidden rounded-lg bg-black/5">{p.images[0] && <Image src={p.images[0].url} alt="" fill sizes="44px" className="object-cover" />}</div><div><Link href={`/produit/${p.id}`} className="font-medium hover:underline">{p.title}</Link>{p.sku && <p className="text-xs text-ink-3">{p.sku}{p._count.variants ? ` · ${p._count.variants} variantes` : ""}</p>}</div></div></Td>
                <Td>{formatEUR(p.priceCents)}</Td>
                <Td className={stock === 0 ? "text-danger" : stock < 5 ? "text-warning" : ""}>{stock}</Td>
                <Td>{p.affiliateEnabled && r ? (r.type === "PERCENT" ? formatBps(r.value) : formatEUR(r.value)) : <span className="text-ink-3">Fermé</span>}</Td>
                <Td>{p._count.selections}</Td>
                <Td><Badge tone={p.status === "ACTIVE" ? "success" : p.status === "SOLD_OUT" ? "danger" : "neutral"}>{productStatusLabel[p.status]}</Badge></Td>
                <Td><div className="flex justify-end gap-2"><ButtonLink href={`/fournisseur/produits/${p.id}`} size="sm" variant="secondary">Modifier</ButtonLink>
                  {p.status === "ACTIVE" ? <ActionButton action={productStatusAction} fields={{ productId: p.id, action: "pause" }}>Suspendre</ActionButton> : (p.status === "PAUSED" || p.status === "DRAFT") && <ActionButton action={productStatusAction} fields={{ productId: p.id, action: p.status === "DRAFT" ? "publish" : "resume" }}>Activer</ActionButton>}</div></Td>
              </tr>);
          })}</tbody>
        </Table></div>
      )}
    </>
  );
}
