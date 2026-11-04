import Image from "next/image";
import Link from "next/link";
import { db } from "@/server/db";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Tabs } from "@/components/ui";
import { ActionButton, Form, Submit } from "@/components/ui/Form";
import { moderateAction } from "@/app/actions/admin";
import { productStatusLabel } from "@/lib/labels";
import { formatEUR } from "@/lib/money";
import type { ProductStatus } from "@prisma/client";

export default async function Moderation({ searchParams }: { searchParams: Promise<{ s?: string; q?: string }> }) {
  const sp = await searchParams;
  const status = (sp.s ?? "PENDING_REVIEW") as ProductStatus | "ALL";
  const products = await db.product.findMany({
    where: { ...(status !== "ALL" ? { status } : {}), ...(sp.q ? { title: { contains: sp.q, mode: "insensitive" } } : {}) },
    orderBy: { createdAt: "desc" }, take: 60, include: { images: { take: 1 }, owner: { select: { displayName: true, email: true } }, category: true },
  });
  return (
    <>
      <PageHeader title="Modération des annonces" subtitle="Produits interdits, contrefaçons, contenus frauduleux : chaque retrait est motivé et notifié au vendeur (DSA)." />
      <Tabs current={`/admin/produits?s=${status}`} items={[["PENDING_REVIEW", "À modérer"], ["ACTIVE", "En ligne"], ["REMOVED", "Retirées"], ["ALL", "Toutes"]].map(([k, l]) => ({ href: `/admin/produits?s=${k}`, label: l }))} />
      <form className="mb-4 flex gap-2"><input type="hidden" name="s" value={status} /><Input name="q" placeholder="Rechercher un titre" defaultValue={sp.q} /><Button variant="dark">OK</Button></form>
      {!products.length ? <EmptyState title="Rien à modérer" /> : (
        <div className="space-y-3">{products.map((p) => (
          <Card key={p.id} className="flex flex-wrap gap-4 p-4">
            <div className="relative h-20 w-20 overflow-hidden rounded-xl bg-black/5">{p.images[0] && <Image src={p.images[0].url} alt="" fill sizes="80px" className="object-cover" />}</div>
            <div className="min-w-0 flex-1">
              <Link href={`/produit/${p.id}`} className="font-medium hover:underline">{p.title}</Link> <Badge>{productStatusLabel[p.status]}</Badge>{p.category.restricted && <Badge tone="warning">Catégorie contrôlée</Badge>}
              <p className="text-sm text-ink-3">{p.owner.displayName} ({p.owner.email}) · {p.category.name} · {formatEUR(p.priceCents)}</p>
              <p className="mt-1 line-clamp-2 text-sm text-ink-2">{p.description}</p>
              {p.moderationNote && <p className="mt-1 text-xs text-warning">{p.moderationNote}</p>}
            </div>
            <div className="flex flex-col gap-2">
              {p.status !== "ACTIVE" && <ActionButton action={moderateAction} fields={{ productId: p.id, decision: "approve" }} variant="accent">Valider</ActionButton>}
              {p.status !== "REMOVED" && (
                <Form action={moderateAction} className="flex gap-1" showOk={false}>
                  <input type="hidden" name="productId" value={p.id} /><input type="hidden" name="decision" value="remove" />
                  <Select name="note" className="h-8 w-44 text-xs"><option>Produit interdit à la vente</option><option>Contrefaçon présumée</option><option>Annonce frauduleuse</option><option>Contenu inapproprié</option><option>Informations trompeuses</option></Select>
                  <Submit size="sm" variant="danger">Retirer</Submit>
                </Form>
              )}
            </div>
          </Card>
        ))}</div>
      )}
    </>
  );
}
