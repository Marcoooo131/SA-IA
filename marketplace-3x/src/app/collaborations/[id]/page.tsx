import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { getContractFor } from "@/server/services/delegation";
import { db } from "@/server/db";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { Alert, Avatar, Badge, ButtonLink, Card, CardHeader, Container, EmptyState, Input, PageHeader, Stat, StatGrid, Table, Td, Th } from "@/components/ui";
import { ActionButton, Form, Submit } from "@/components/ui/Form";
import { decidePriceAction, endContractAction, entrustAction, proposePriceAction, withdrawProductAction } from "@/app/actions/delegation";
import { modeLabel, productStatusLabel } from "@/lib/labels";
import { formatBps, formatEUR } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/format";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  let c;
  try { c = await getContractFor(actor, id); } catch (e) { if (e instanceof ForbiddenError || e instanceof NotFoundError || e instanceof AppError) notFound(); throw e; }
  const isOwner = c.ownerId === actor.id;
  const isPro = c.professionalId === actor.id;
  const [available, sales, activity] = await Promise.all([
    isOwner ? db.product.findMany({ where: { ownerId: actor.id, contractId: null, sellerKind: "INDIVIDUAL", status: { in: ["ACTIVE", "PAUSED", "DRAFT"] } }, include: { images: { take: 1 } } }) : [],
    db.orderItem.findMany({ where: { contractId: c.id, order: { paidAt: { not: null } } }, include: { order: true, commissions: { where: { OR: [{ beneficiaryId: actor.id }, ...(isOwner || isPro ? [{ beneficiary: "PROFESSIONAL" as const }, { beneficiary: "SELLER" as const }] : [])] } } }, orderBy: { order: { createdAt: "desc" } } }),
    db.auditLog.findMany({ where: { OR: [{ entityType: "CollaborationContract", entityId: c.id }, { entityType: "Product", entityId: { in: c.products.map((p) => p.id) } }] }, orderBy: { createdAt: "desc" }, take: 30, include: { actor: { select: { displayName: true } } } }),
  ]);
  const revenue = sales.filter((s) => !["CANCELLED", "REFUNDED"].includes(s.order.status)).reduce((a, s) => a + s.unitPriceCents * s.quantity, 0);
  const proCommission = sales.flatMap((s) => s.commissions).filter((x) => x.kind === "PRO_COMMISSION" && x.status !== "CANCELLED").reduce((a, x) => a + x.amountCents, 0);
  const active = c.status === "ACTIVE";
  const actionLabels: Record<string, string> = {
    "contract.create": "Contrat créé", "contract.entrust": "Articles confiés", "contract.withdraw_product": "Article retiré", "contract.end": "Collaboration terminée",
    "product.update_by_professional": "Annonce retravaillée par l'indépendant", "product.update": "Annonce modifiée par le propriétaire", "price.approve": "Prix validé", "price.reject": "Prix refusé",
  };

  return (
    <Container className={`${isPro ? "accent-pro" : "accent-individual"} py-10`}>
      <PageHeader eyebrow="Collaboration" title={isOwner ? `Avec ${c.professional.displayName}` : `Pour ${c.owner.displayName}`}
        subtitle={`${modeLabel[c.mode]} · commission ${formatBps(c.commissionBps)} (figée) · du ${formatDate(c.startsAt)} au ${formatDate(c.endsAt)}`}
        action={<>
          <Badge tone={active ? "success" : "neutral"} className="h-8 px-3">{active ? "Active" : "Terminée"}</Badge>
          {active && <ActionButton action={endContractAction} fields={{ contractId: c.id }} variant="danger" confirm="Mettre fin à la collaboration ? Les articles redeviennent gérés par le propriétaire ; les ventes en cours restent dues.">Mettre fin</ActionButton>}
        </>} />
      <StatGrid>
        <Stat label="Articles confiés" value={c.products.length} />
        <Stat label="Ventes" value={sales.length} />
        <Stat label="Chiffre d'affaires" value={formatEUR(revenue)} />
        <Stat label="Commission de l'indépendant" value={formatEUR(proCommission)} hint="Nette des frais de plateforme" />
      </StatGrid>
      <div className="mt-6 rounded-2xl border border-line bg-white p-4 text-sm text-ink-2">
        <strong className="text-ink">Règles :</strong> le propriétaire reste propriétaire des articles et valide chaque prix. L&apos;indépendant peut retravailler photos et descriptions,
        négocier au-dessus du prix plancher fixé par le propriétaire{c.handlesShipping ? ", et prend en charge la préparation et l'expédition" : " ; le propriétaire expédie les commandes"}.
        Les conditions financières sont figées et ne peuvent être modifiées par aucune des parties.
      </div>

      <Card className="mt-6">
        <CardHeader title="Articles confiés" />
        {!c.products.length ? <div className="p-5"><EmptyState title="Aucun article confié pour le moment" text={isOwner ? "Sélectionnez ci-dessous les annonces que l'indépendant commercialisera." : "Le propriétaire doit valider les articles concernés."} /></div> : (
          <Table>
            <thead><tr><Th>Article</Th><Th>Prix</Th><Th>Plancher</Th><Th>Statut</Th><Th /></tr></thead>
            <tbody>{c.products.map((p) => {
              const prop = p.priceProposals[0];
              return (
                <tr key={p.id}>
                  <Td><div className="flex items-center gap-3"><div className="relative h-11 w-11 overflow-hidden rounded-lg bg-black/5">{p.images[0] && <Image src={p.images[0].url} alt="" fill sizes="44px" className="object-cover" />}</div><Link href={`/produit/${p.id}`} className="font-medium hover:underline">{p.title}</Link></div></Td>
                  <Td>{formatEUR(p.priceCents)}{prop && <p className="text-xs text-warning">Proposé : {formatEUR(prop.priceCents)}</p>}</Td>
                  <Td className="text-ink-3">{p.minPriceCents ? formatEUR(p.minPriceCents) : "—"}</Td>
                  <Td><Badge>{productStatusLabel[p.status]}</Badge></Td>
                  <Td><div className="flex flex-wrap justify-end gap-2">
                    {isPro && active && <>
                      <ButtonLink href={`/pro/ventes/${p.id}`} size="sm" variant="secondary">Retravailler l&apos;annonce</ButtonLink>
                      <Form action={proposePriceAction} className="flex items-center gap-1" showOk={false}>
                        <input type="hidden" name="productId" value={p.id} /><input type="hidden" name="contractId" value={c.id} />
                        <Input name="price" placeholder="Prix €" className="h-8 w-24" required /><Submit size="sm" variant="secondary">Proposer</Submit>
                      </Form></>}
                    {isOwner && prop && <>
                      <ActionButton action={decidePriceAction} fields={{ proposalId: prop.id, decision: "approve", contractId: c.id }} variant="accent">Valider {formatEUR(prop.priceCents)}</ActionButton>
                      <ActionButton action={decidePriceAction} fields={{ proposalId: prop.id, decision: "reject", contractId: c.id }}>Refuser</ActionButton></>}
                    {isOwner && active && <ActionButton action={withdrawProductAction} fields={{ productId: p.id, contractId: c.id }} variant="ghost">Retirer</ActionButton>}
                  </div></Td>
                </tr>
              );
            })}</tbody>
          </Table>
        )}
      </Card>

      {isOwner && active && (
        <Card className="mt-6">
          <CardHeader title="Confier d'autres articles" subtitle="Le prix plancher (facultatif) est le minimum que l'indépendant peut accepter sur une offre d'acheteur." />
          {!available.length ? <p className="p-5 text-sm text-ink-3">Aucune autre annonce disponible. <Link href="/espace/annonces/nouvelle" className="underline">Publier un article</Link></p> : (
            <Form action={entrustAction} className="p-5">
              <input type="hidden" name="contractId" value={c.id} />
              <ul className="space-y-2">{available.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
                  <input type="checkbox" name="productIds" value={p.id} className="h-4 w-4" aria-label={p.title} />
                  <span className="flex-1 font-medium">{p.title} <span className="font-normal text-ink-3">· {formatEUR(p.priceCents)}</span></span>
                  <Input name={`min_${p.id}`} placeholder="Plancher €" className="h-9 w-32" defaultValue={p.minPriceCents ? (p.minPriceCents / 100).toString() : ""} />
                </li>))}</ul>
              <Submit variant="accent" className="mt-4">Confier la sélection</Submit>
            </Form>
          )}
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Ventes" />
          {!sales.length ? <p className="p-5 text-sm text-ink-3">Aucune vente pour le moment.</p> : (
            <ul className="divide-y divide-line text-sm">{sales.map((s) => (
              <li key={s.id} className="flex justify-between p-4"><Link href={`/commandes/${s.orderId}`} className="hover:underline">{s.title}<span className="block text-xs text-ink-3">{s.order.number} · {formatDate(s.order.createdAt)}</span></Link><span className="font-semibold">{formatEUR(s.unitPriceCents * s.quantity)}</span></li>
            ))}</ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Journal d'activité" subtitle="Toutes les opérations sont visibles des deux parties" />
          <ul className="divide-y divide-line text-sm">{activity.map((a) => (
            <li key={a.id} className="flex items-center gap-3 p-3"><Avatar name={a.actor?.displayName ?? "Système"} size={26} /><span className="flex-1">{actionLabels[a.action] ?? a.action}<span className="block text-xs text-ink-3">{a.actor?.displayName} · {formatDateTime(a.createdAt)}</span></span></li>
          ))}</ul>
        </Card>
      </div>
      {isPro && <div className="mt-6"><Alert tone="info">Échangez avec le propriétaire via la <Link href="/messages" className="underline">messagerie</Link>.</Alert></div>}
    </Container>
  );
}
