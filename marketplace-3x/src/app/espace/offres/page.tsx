import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/ui/Form";
import { decideOfferAction } from "@/app/actions/shop";
import { formatEUR } from "@/lib/money";
import { timeAgo } from "@/lib/format";

export default async function Offers() {
  const actor = await requireActor();
  const [received, sent] = await Promise.all([
    db.productOffer.findMany({ where: { product: { ownerId: actor.id } }, orderBy: { createdAt: "desc" }, take: 50, include: { product: { include: { contract: { include: { professional: { select: { displayName: true } } } } } }, buyer: { select: { displayName: true } } } }),
    db.productOffer.findMany({ where: { buyerId: actor.id }, orderBy: { createdAt: "desc" }, take: 50, include: { product: true } }),
  ]);
  return (
    <>
      <PageHeader title="Offres" subtitle="Négociez le prix de vos annonces. Une offre acceptée permet à l'acheteur de payer le prix convenu." />
      <h2 className="mb-3 font-semibold">Reçues</h2>
      {!received.length ? <EmptyState title="Aucune offre reçue" /> : (
        <div className="space-y-2">{received.map((o) => (
          <Card key={o.id} className="flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <Link href={`/produit/${o.productId}`} className="font-medium hover:underline">{o.product.title}</Link>
              <p className="text-sm text-ink-3">{o.buyer.displayName} propose <strong className="text-ink">{formatEUR(o.amountCents)}</strong> (prix affiché {formatEUR(o.product.priceCents)}) · {timeAgo(o.createdAt)}</p>
              {o.message && <p className="mt-1 text-sm text-ink-2">« {o.message} »</p>}
              {o.product.contract?.status === "ACTIVE" && <p className="mt-1 text-xs text-pro">Article confié à {o.product.contract.professional.displayName} — il traite les offres au-dessus de votre prix plancher.</p>}
            </div>
            {o.status === "PENDING" ? (
              <div className="flex gap-2">
                <ActionButton action={decideOfferAction} fields={{ offerId: o.id, decision: "accept" }} variant="accent">Accepter</ActionButton>
                <ActionButton action={decideOfferAction} fields={{ offerId: o.id, decision: "decline" }}>Refuser</ActionButton>
              </div>
            ) : <Badge tone={o.status === "ACCEPTED" || o.status === "USED" ? "success" : "neutral"}>{{ ACCEPTED: "Acceptée", DECLINED: "Refusée", EXPIRED: "Expirée", USED: "Achetée", PENDING: "" }[o.status]}</Badge>}
          </Card>))}</div>
      )}
      <h2 className="mb-3 mt-8 font-semibold">Envoyées</h2>
      {!sent.length ? <EmptyState title="Aucune offre envoyée" /> : (
        <div className="space-y-2">{sent.map((o) => (
          <Card key={o.id} className="flex items-center justify-between p-4 text-sm">
            <Link href={`/produit/${o.productId}`} className="font-medium hover:underline">{o.product.title}</Link>
            <span>{formatEUR(o.amountCents)} · <Badge tone={o.status === "ACCEPTED" ? "success" : "neutral"}>{{ PENDING: "En attente", ACCEPTED: "Acceptée — achetez au prix négocié", DECLINED: "Refusée", EXPIRED: "Expirée", USED: "Achetée" }[o.status]}</Badge></span>
          </Card>))}</div>
      )}
    </>
  );
}
