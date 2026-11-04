import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/ui/Form";
import { respondAction, withdrawOfferAction } from "@/app/actions/delegation";
import { modeLabel, offerStatusLabel } from "@/lib/labels";
import { formatBps } from "@/lib/money";
import { timeAgo } from "@/lib/format";

export default async function Proposals() {
  const actor = await requireActor();
  const offers = await db.collaborationOffer.findMany({ where: { professionalId: actor.id }, orderBy: { createdAt: "desc" }, include: { from: { select: { displayName: true, city: true } }, to: { select: { displayName: true, city: true } }, contract: true, request: { select: { title: true } } } });
  const received = offers.filter((o) => o.toUserId === actor.id);
  const sent = offers.filter((o) => o.fromUserId === actor.id);
  const Row = ({ o, incoming }: { o: (typeof offers)[number]; incoming: boolean }) => { const owner = incoming ? o.from : o.to; return (
    <Card className="flex flex-wrap items-start gap-4 p-5">
      <Avatar name={owner.displayName} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{owner.displayName} <span className="font-normal text-ink-3">· {owner.city}</span></p>
        <p className="text-sm text-ink-3">{o.request?.title ?? (incoming ? "Demande directe depuis l'annuaire" : "Proposition spontanée")} · {timeAgo(o.createdAt)}</p>
        <div className="mt-2 flex flex-wrap gap-2"><Badge tone="pro">{formatBps(o.commissionBps)}</Badge><Badge>{modeLabel[o.mode]}</Badge><Badge>{o.durationDays} j</Badge></div>
        <p className="mt-2 whitespace-pre-line text-sm text-ink-2">{o.message}</p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <Badge tone={o.status === "ACCEPTED" ? "success" : o.status === "PENDING" ? "warning" : "neutral"}>{offerStatusLabel[o.status]}</Badge>
        {o.status === "PENDING" && incoming && <div className="flex gap-2"><ActionButton action={respondAction} fields={{ offerId: o.id, decision: "accept" }} variant="accent">Accepter</ActionButton><ActionButton action={respondAction} fields={{ offerId: o.id, decision: "refuse" }}>Refuser</ActionButton></div>}
        {o.status === "PENDING" && !incoming && <ActionButton action={withdrawOfferAction} fields={{ offerId: o.id }} variant="ghost">Retirer</ActionButton>}
        {o.contract && <Link href={`/collaborations/${o.contract.id}`} className="text-sm text-pro underline">Ouvrir la collaboration</Link>}
      </div>
    </Card>
  ); };
  return (
    <>
      <PageHeader title="Propositions commerciales" subtitle="Demandes reçues des particuliers et propositions que vous avez envoyées." />
      <h2 className="mb-3 font-semibold">Demandes reçues</h2>
      {received.length ? <div className="space-y-3">{received.map((o) => <Row key={o.id} o={o} incoming />)}</div> : <EmptyState title="Aucune demande reçue" text="Complétez votre profil public pour apparaître en tête de l'annuaire." />}
      <h2 className="mb-3 mt-8 font-semibold">Propositions envoyées</h2>
      {sent.length ? <div className="space-y-3">{sent.map((o) => <Row key={o.id} o={o} incoming={false} />)}</div> : <EmptyState title="Aucune proposition envoyée" />}
    </>
  );
}
