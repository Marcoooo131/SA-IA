import Link from "next/link";
import { db } from "@/server/db";
import { disputeReasonLabel } from "@/server/services/orders";
import { Badge, Card, Checkbox, EmptyState, PageHeader, Textarea } from "@/components/ui";
import { ActionButton, Form, Submit } from "@/components/ui/Form";
import { disputeDecisionAction, disputeReviewAction } from "@/app/actions/admin";
import { disputeStatusLabel } from "@/lib/labels";
import { formatEUR } from "@/lib/money";
import { formatDateTime } from "@/lib/format";

export default async function Disputes() {
  const disputes = await db.dispute.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100, include: { order: { include: { buyer: { select: { displayName: true } }, seller: { select: { displayName: true } } } }, openedBy: { select: { displayName: true } } } });
  return (
    <>
      <PageHeader title="Litiges" subtitle="Les fonds liés à une commande en litige sont gelés jusqu'à la décision." />
      {!disputes.length ? <EmptyState title="Aucun litige" /> : <div className="space-y-3">{disputes.map((d) => {
        const open = d.status === "OPEN" || d.status === "UNDER_REVIEW";
        return (
          <Card key={d.id} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{disputeReasonLabel[d.reason]} · <Link href={`/commandes/${d.orderId}`} className="underline">{d.order.number}</Link> · {formatEUR(d.order.totalCents)}</p>
              <Badge tone={open ? "danger" : "success"}>{disputeStatusLabel[d.status]}</Badge>
            </div>
            <p className="text-sm text-ink-3">Ouvert par {d.openedBy.displayName} le {formatDateTime(d.createdAt)} · acheteur {d.order.buyer.displayName}, vendeur {d.order.seller.displayName}</p>
            <p className="mt-2 text-sm text-ink-2">{d.description}</p>
            {d.resolution && <p className="mt-1 text-sm">Décision : {d.resolution}</p>}
            {open && (
              <div className="mt-4 grid gap-3 md:grid-cols-[auto_1fr]">
                {d.status === "OPEN" && <ActionButton action={disputeReviewAction} fields={{ disputeId: d.id }}>Prendre en charge</ActionButton>}
                <Form action={disputeDecisionAction} className="space-y-2" showOk={false}>
                  <input type="hidden" name="disputeId" value={d.id} />
                  <Textarea name="resolution" required placeholder="Motivation de la décision (communiquée aux parties)" className="min-h-16" />
                  <Checkbox name="restock" label="Remettre l'article en stock (retour reçu)" />
                  <div className="flex gap-2"><Submit size="sm" variant="danger" name="refund" value="1" confirm="Rembourser intégralement l'acheteur ?">Rembourser l&apos;acheteur</Submit><Submit size="sm" variant="secondary" name="refund" value="0">Clore sans remboursement</Submit></div>
                </Form>
              </div>
            )}
          </Card>);
      })}</div>}
    </>
  );
}
