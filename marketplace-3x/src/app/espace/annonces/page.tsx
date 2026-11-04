import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { Badge, ButtonLink, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { ActionButton } from "@/components/ui/Form";
import { productStatusAction } from "@/app/actions/products";
import { productStatusLabel } from "@/lib/labels";
import { formatEUR } from "@/lib/money";

export default async function MyListings() {
  const actor = await requireActor();
  const products = await db.product.findMany({
    where: { ownerId: actor.id, status: { not: "REMOVED" } }, orderBy: { createdAt: "desc" },
    include: { images: { take: 1, orderBy: { position: "asc" } }, contract: { include: { professional: { select: { displayName: true } } } }, _count: { select: { favorites: true, orderItems: true } } },
  });
  return (
    <>
      <PageHeader title="Mes annonces" action={<ButtonLink href="/espace/annonces/nouvelle" variant="accent"><Plus className="h-4 w-4" />Nouvelle annonce</ButtonLink>} />
      {!products.length ? <EmptyState title="Vous n'avez encore rien publié" text="Une annonce se crée en deux minutes." action={<ButtonLink href="/espace/annonces/nouvelle" variant="accent">Publier un article</ButtonLink>} /> : (
        <div className="rounded-[var(--radius)] border border-line bg-white">
          <Table>
            <thead><tr><Th>Article</Th><Th>Prix</Th><Th>Statut</Th><Th>Vues · favoris</Th><Th>Géré par</Th><Th /></tr></thead>
            <tbody>{products.map((p) => (
              <tr key={p.id}>
                <Td><div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-black/5">{p.images[0] && <Image src={p.images[0].url} alt="" fill sizes="48px" className="object-cover" />}</div>
                  <Link href={`/produit/${p.id}`} className="font-medium hover:underline">{p.title}</Link></div></Td>
                <Td>{formatEUR(p.priceCents)}</Td>
                <Td><Badge tone={p.status === "ACTIVE" ? "success" : p.status === "PENDING_REVIEW" ? "warning" : "neutral"}>{productStatusLabel[p.status]}</Badge>{p.moderationNote && <p className="mt-1 text-xs text-ink-3">{p.moderationNote}</p>}</Td>
                <Td className="text-ink-3">{p.viewCount} · {p._count.favorites}</Td>
                <Td>{p.contract?.status === "ACTIVE" ? <Link href={`/collaborations/${p.contract.id}`} className="text-pro hover:underline">{p.contract.professional.displayName}</Link> : <span className="text-ink-3">Moi</span>}</Td>
                <Td><div className="flex justify-end gap-2">
                  <ButtonLink href={`/espace/annonces/${p.id}`} variant="secondary" size="sm">Modifier</ButtonLink>
                  {p.status === "ACTIVE" && <ActionButton action={productStatusAction} fields={{ productId: p.id, action: "pause" }}>Suspendre</ActionButton>}
                  {(p.status === "PAUSED" || p.status === "DRAFT") && <ActionButton action={productStatusAction} fields={{ productId: p.id, action: p.status === "DRAFT" ? "publish" : "resume" }}>Publier</ActionButton>}
                  {p._count.orderItems === 0 && <ActionButton action={productStatusAction} fields={{ productId: p.id, action: "remove" }} variant="ghost" confirm="Supprimer définitivement cette annonce ?">Supprimer</ActionButton>}
                </div></Td>
              </tr>
            ))}</tbody>
          </Table>
        </div>
      )}
    </>
  );
}
