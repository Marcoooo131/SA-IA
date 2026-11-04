import Image from "next/image";
import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/ui/Form";
import { decideOfferAction } from "@/app/actions/shop";
import { OrderList } from "@/components/OrderList";
import { productStatusLabel } from "@/lib/labels";
import { formatBps, formatEUR } from "@/lib/money";

export default async function DelegatedSales() {
  const actor = await requireActor();
  const [products, offers, orders] = await Promise.all([
    db.product.findMany({ where: { contract: { professionalId: actor.id, status: "ACTIVE" } }, include: { images: { take: 1 }, owner: { select: { displayName: true } }, contract: true, priceProposals: { where: { status: "PENDING" } } } }),
    db.productOffer.findMany({ where: { status: "PENDING", product: { contract: { professionalId: actor.id, status: "ACTIVE" } } }, include: { product: true, buyer: { select: { displayName: true } } } }),
    db.order.findMany({ where: { items: { some: { professionalId: actor.id } }, paidAt: { not: null } }, orderBy: { createdAt: "desc" }, take: 20, include: { items: { include: { product: { include: { images: { take: 1 } } } } } } }),
  ]);
  return (
    <>
      <PageHeader title="Ventes déléguées" subtitle="Les articles qui vous sont confiés, les offres à traiter et les commandes générées." />
      {offers.length > 0 && (
        <Card className="mb-6"><CardHeader title={`Offres d'acheteurs à traiter (${offers.length})`} subtitle="Vous pouvez accepter au-dessus du prix plancher fixé par le propriétaire ; en dessous, seul le propriétaire décide." />
          <ul className="divide-y divide-line">{offers.map((o) => {
            const ok = o.product.minPriceCents != null && o.amountCents >= o.product.minPriceCents;
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <div className="flex-1"><p className="font-medium">{o.product.title}</p><p className="text-ink-3">{o.buyer.displayName} propose {formatEUR(o.amountCents)} · affiché {formatEUR(o.product.priceCents)} · plancher {o.product.minPriceCents ? formatEUR(o.product.minPriceCents) : "non défini"}</p></div>
                {ok ? <ActionButton action={decideOfferAction} fields={{ offerId: o.id, decision: "accept" }} variant="accent">Accepter</ActionButton> : <Badge tone="warning">Validation du propriétaire requise</Badge>}
                <ActionButton action={decideOfferAction} fields={{ offerId: o.id, decision: "decline" }}>Refuser</ActionButton>
              </li>);
          })}</ul></Card>
      )}
      <Card className="mb-6"><CardHeader title={`Articles confiés (${products.length})`} />
        {!products.length ? <div className="p-5"><EmptyState title="Aucun article confié" /></div> : (
          <ul className="divide-y divide-line">{products.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="relative h-14 w-14 overflow-hidden rounded-xl bg-black/5">{p.images[0] && <Image src={p.images[0].url} alt="" fill sizes="56px" className="object-cover" />}</div>
              <div className="min-w-0 flex-1"><Link href={`/produit/${p.id}`} className="font-medium hover:underline">{p.title}</Link>
                <p className="text-sm text-ink-3">{p.owner.displayName} · {formatEUR(p.priceCents)} · {productStatusLabel[p.status]} · {p.viewCount} vues · commission {formatBps(p.contract!.commissionBps)} ≈ {formatEUR(Math.floor(p.priceCents * p.contract!.commissionBps / 10000))}</p>
                {p.priceProposals.length > 0 && <p className="text-xs text-warning">Prix proposé en attente de validation</p>}</div>
              <ButtonLink href={`/pro/ventes/${p.id}`} size="sm" variant="secondary">Retravailler</ButtonLink>
              <ButtonLink href={`/collaborations/${p.contractId}`} size="sm" variant="ghost">Collaboration</ButtonLink>
            </li>))}</ul>
        )}
      </Card>
      <h2 className="mb-3 font-semibold">Commandes attribuées</h2>
      <OrderList orders={orders} empty="Aucune commande pour le moment" />
    </>
  );
}
