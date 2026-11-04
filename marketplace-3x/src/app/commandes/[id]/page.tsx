import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { getOrderDetail, disputeReasonLabel } from "@/server/services/orders";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { Alert, Badge, Card, CardHeader, Container, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ActionButton, Form, Submit } from "@/components/ui/Form";
import { orderTone } from "@/components/OrderList";
import { commissionTone } from "@/components/CommissionTable";
import { cancelAction, deliveredAction, disputeAction, lostAction, receiptAction, reviewAction, shipAction } from "@/app/actions/orders";
import { carriers, commissionKindLabel, commissionStatusLabel, disputeStatusLabel, orderStatusLabel, saleTypeLabel, shipmentStatusLabel } from "@/lib/labels";
import { formatEUR } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { db } from "@/server/db";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  let data;
  try { data = await getOrderDetail(actor, id); } catch (e) { if (e instanceof ForbiddenError || e instanceof NotFoundError) notFound(); throw e; }
  const { order: o, roles } = data;
  const shipper = o.items.find((i) => i.saleType === "DELEGATED" && i.contract?.handlesShipping)?.professionalId ?? o.sellerId;
  const isShipper = shipper === actor.id;
  const steps = [
    { label: "Payée", at: o.paidAt }, { label: "Expédiée", at: o.shippedAt }, { label: "Livrée", at: o.deliveredAt }, { label: "Réception confirmée", at: o.receivedAt },
  ];
  const openDispute = o.disputes.find((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW");
  const pros = [...new Map(o.items.filter((i) => i.professionalId).map((i) => [i.professionalId!, i.contract?.professional.displayName ?? i.attribution?.link.professional.displayName ?? "Indépendant"])).entries()];
  const reviewTargets = [{ id: o.sellerId, name: o.seller.supplierProfile?.companyName ?? o.seller.displayName, label: "le vendeur" }, ...pros.map(([pid, name]) => ({ id: pid, name, label: "l'indépendant" }))];
  const myLines = o.items.flatMap((i) => i.commissions.map((c) => ({ ...c, title: i.title })));
  const sellerName = o.seller.supplierProfile?.companyName ?? o.seller.displayName;
  const buyerConv = await db.conversation.findFirst({ where: { orderId: o.id, participants: { some: { userId: actor.id } } } });

  return (
    <Container className="max-w-5xl py-10">
      <PageHeader eyebrow={`Commande ${o.number}`} title={orderStatusLabel[o.status]} subtitle={`Passée le ${formatDateTime(o.createdAt)} · ${roles.buyer ? `vendue par ${sellerName}` : `achetée par ${o.buyer.displayName}`}`}
        action={<Badge tone={orderTone[o.status]} className="h-8 px-3">{orderStatusLabel[o.status]}</Badge>} />
      {o.payment?.provider === "demo" && <div className="mb-4"><Alert tone="warning">Commande de démonstration : paiement simulé par le bac à sable, aucun argent réel.</Alert></div>}

      <Card className="mb-6 p-5">
        <ol className="grid grid-cols-4 gap-2">
          {steps.map((s, i) => (
            <li key={s.label} className="flex flex-col items-center text-center">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${s.at ? "bg-success text-white" : "bg-black/5 text-ink-3"}`}>{s.at ? <Check className="h-4 w-4" /> : i + 1}</span>
              <span className="mt-1.5 text-xs font-medium">{s.label}</span>
              <span className="text-[11px] text-ink-3">{s.at ? formatDateTime(s.at) : "—"}</span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Articles" />
            <ul className="divide-y divide-line">{o.items.map((i) => (
              <li key={i.id} className="flex gap-4 p-4">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-black/5">{i.product.images[0] && <Image src={i.product.images[0].url} alt="" fill sizes="64px" className="object-cover" />}</div>
                <div className="flex-1">
                  <Link href={`/produit/${i.productId}`} className="font-medium hover:underline">{i.title}</Link>
                  <p className="text-sm text-ink-3">{i.quantity} × {formatEUR(i.unitPriceCents)} · {saleTypeLabel[i.saleType]}</p>
                  {i.contract && <p className="text-xs text-pro">Vente gérée par {i.contract.professional.displayName}</p>}
                  {i.attribution && <p className="text-xs text-pro">Recommandé par {i.attribution.link.professional.displayName}</p>}
                </div>
                <p className="font-semibold">{formatEUR(i.unitPriceCents * i.quantity)}</p>
              </li>))}</ul>
            <dl className="space-y-1 border-t border-line p-4 text-sm">
              <div className="flex justify-between"><dt className="text-ink-2">Sous-total</dt><dd>{formatEUR(o.subtotalCents)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">Livraison</dt><dd>{formatEUR(o.shippingCents)}</dd></div>
              {o.discountCents > 0 && <div className="flex justify-between text-success"><dt>Remise</dt><dd>−{formatEUR(o.discountCents)}</dd></div>}
              <div className="flex justify-between pt-1 text-base font-semibold"><dt>Total payé</dt><dd>{formatEUR(o.totalCents)}</dd></div>
            </dl>
          </Card>

          {myLines.length > 0 && (
            <Card>
              <CardHeader title={roles.admin ? "Répartition financière (administration)" : "Votre part"} subtitle="Calculée côté serveur au moment de la commande, à partir des taux figés" />
              <ul className="divide-y divide-line text-sm">{myLines.map((c) => (
                <li key={c.id} className="p-4">
                  <div className="flex items-center justify-between"><span>{commissionKindLabel[c.kind]}{roles.admin && <span className="text-ink-3"> · {c.beneficiary}</span>}</span><span className="flex items-center gap-2"><Badge tone={commissionTone[c.status]}>{commissionStatusLabel[c.status]}</Badge><strong>{formatEUR(c.amountCents)}</strong></span></div>
                  <ul className="mt-2 space-y-0.5 text-xs text-ink-3">{c.history.map((h) => <li key={h.id}>{formatDateTime(h.createdAt)} — {h.reason} ({commissionStatusLabel[h.toStatus]})</li>)}</ul>
                </li>))}</ul>
            </Card>
          )}

          {o.disputes.length > 0 && (
            <Card><CardHeader title="Litiges" />
              <ul className="divide-y divide-line text-sm">{o.disputes.map((d) => (
                <li key={d.id} className="p-4"><div className="flex justify-between"><strong>{disputeReasonLabel[d.reason]}</strong><Badge tone={d.status.startsWith("RESOLVED") ? "success" : "danger"}>{disputeStatusLabel[d.status]}</Badge></div>
                  <p className="mt-1 text-ink-2">{d.description}</p>{d.resolution && <p className="mt-1 text-ink-3">Décision : {d.resolution}</p>}</li>
              ))}</ul></Card>
          )}

          {roles.buyer && o.status === "COMPLETED" && (
            <Card><CardHeader title="Laisser un avis" subtitle="Votre avis aide la communauté (achat vérifié)" />
              <div className="grid gap-4 p-5 md:grid-cols-2">{reviewTargets.map((t) => {
                const existing = o.reviews.find((r) => r.targetId === t.id && r.authorId === actor.id);
                return (
                  <Form key={t.id} action={reviewAction} className="space-y-2">
                    <input type="hidden" name="orderId" value={o.id} /><input type="hidden" name="targetId" value={t.id} />
                    <p className="text-sm font-medium">Évaluer {t.label} : {t.name}</p>
                    <Select name="rating" defaultValue={String(existing?.rating ?? 5)}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n}/5)</option>)}</Select>
                    <Textarea name="comment" defaultValue={existing?.comment ?? ""} placeholder="Votre commentaire" className="min-h-16" />
                    <Submit size="sm" variant="secondary">{existing ? "Modifier mon avis" : "Publier l'avis"}</Submit>
                  </Form>);
              })}</div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {isShipper && o.status === "PAID" && (
            <Card className="p-5">
              <h2 className="font-semibold">Expédier la commande</h2>
              <p className="mt-1 text-sm text-ink-3">À envoyer à : {o.shippingName}, {o.shippingLine1}{o.shippingLine2 ? `, ${o.shippingLine2}` : ""}, {o.shippingPostal} {o.shippingCity}</p>
              {o.carrierChoice && <p className="text-sm text-ink-3">Transporteur choisi : {carriers.find((c) => c.id === o.carrierChoice)?.label ?? o.carrierChoice}</p>}
              <Form action={shipAction} className="mt-3 space-y-2">
                <input type="hidden" name="orderId" value={o.id} />
                <Select name="carrier" defaultValue={o.carrierChoice ?? "colissimo"}>{carriers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
                <Input name="trackingNumber" placeholder="Numéro de suivi" />
                <Submit className="w-full">Confirmer l&apos;expédition</Submit>
              </Form>
              <div className="mt-3 border-t border-line pt-3"><Form action={cancelAction}><input type="hidden" name="orderId" value={o.id} /><input type="hidden" name="reason" value="Article indisponible" /><Submit variant="ghost" size="sm" confirm="Annuler la commande ? L'acheteur sera intégralement remboursé.">Annuler et rembourser</Submit></Form></div>
            </Card>
          )}
          {(isShipper || roles.admin) && o.status === "SHIPPED" && (
            <Card className="space-y-2 p-5"><h2 className="font-semibold">Suivi du colis</h2>
              <ActionButton action={deliveredAction} fields={{ orderId: o.id }} size="md">Marquer comme livré</ActionButton>
              <ActionButton action={lostAction} fields={{ orderId: o.id }} variant="ghost" confirm="Déclarer le colis perdu ? Un litige sera ouvert.">Déclarer perdu</ActionButton>
            </Card>
          )}
          {roles.buyer && (o.status === "SHIPPED" || o.status === "DELIVERED") && (
            <Card className="p-5"><h2 className="font-semibold">Vous avez reçu votre article ?</h2>
              <p className="mt-1 text-sm text-ink-3">Confirmez si tout est conforme : le vendeur sera payé après le délai de validation. Sinon, ouvrez un litige.</p>
              <ActionButton action={receiptAction} fields={{ orderId: o.id }} size="md" variant="primary" className="mt-3 w-full" confirm="Confirmer que l'article reçu est conforme ?">Confirmer la réception</ActionButton>
            </Card>
          )}
          {(roles.buyer || roles.seller) && !openDispute && ["PAID", "SHIPPED", "DELIVERED", "COMPLETED"].includes(o.status) && (
            <Card className="p-5">
              <details><summary className="cursor-pointer list-none font-semibold">Signaler un problème</summary>
                <Form action={disputeAction} className="mt-3 space-y-2">
                  <input type="hidden" name="orderId" value={o.id} />
                  <Field label="Motif"><Select name="reason">{Object.entries(disputeReasonLabel).filter(([k]) => k !== "LOST").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                  <Textarea name="description" required placeholder="Décrivez la situation (photos possibles via la messagerie)" />
                  <Submit variant="danger" size="sm">Ouvrir un litige</Submit>
                </Form>
              </details>
            </Card>
          )}
          <Card className="p-5 text-sm">
            <h2 className="font-semibold">Livraison</h2>
            <p className="mt-1 text-ink-2">{o.shippingName}<br />{o.shippingLine1}{o.shippingLine2 && <><br />{o.shippingLine2}</>}<br />{o.shippingPostal} {o.shippingCity}</p>
            {o.shipments.map((s) => <p key={s.id} className="mt-2 text-ink-3">{carriers.find((c) => c.id === s.carrier)?.label ?? s.carrier} {s.trackingNumber && `· ${s.trackingNumber}`} · {shipmentStatusLabel[s.status]}</p>)}
          </Card>
          <Card className="p-5 text-sm">
            <h2 className="font-semibold">Une question ?</h2>
            {buyerConv ? <Link href={`/messages/${buyerConv.id}`} className="text-brand underline">Ouvrir la conversation</Link> : (
              <Form action={(await import("@/app/actions/shop")).contactAction} className="mt-2 space-y-2">
                <input type="hidden" name="to" value={roles.buyer ? shipper : o.buyerId} />
                <input type="hidden" name="subject" value={`Commande ${o.number}`} /><input type="hidden" name="orderId" value={o.id} />
                <Textarea name="body" required className="min-h-16" placeholder={roles.buyer ? "Message au vendeur" : "Message à l'acheteur"} />
                <Submit size="sm" variant="secondary">Envoyer</Submit>
              </Form>
            )}
          </Card>
        </div>
      </div>
    </Container>
  );
}
