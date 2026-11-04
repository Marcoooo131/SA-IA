import Link from "next/link";
import { Briefcase } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCommerceSettings } from "@/server/settings";
import { Avatar, Badge, ButtonLink, Card, CardHeader, Checkbox, EmptyState, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ActionButton, Form, Submit } from "@/components/ui/Form";
import { closeRequestAction, createRequestAction, respondAction, withdrawOfferAction } from "@/app/actions/delegation";
import { modeLabel, offerStatusLabel } from "@/lib/labels";
import { formatBps, formatEUR } from "@/lib/money";
import { formatDate, timeAgo } from "@/lib/format";

export const metadata = { title: "Confier mes ventes" };

export default async function Delegation() {
  const actor = await requireActor();
  const [settings, categories, requests, offers, contracts, user] = await Promise.all([
    getCommerceSettings(),
    db.category.findMany({ where: { parentId: null, restricted: false }, orderBy: { position: "asc" } }),
    db.delegationRequest.findMany({ where: { ownerId: actor.id }, orderBy: { createdAt: "desc" }, include: { _count: { select: { offers: true } } } }),
    db.collaborationOffer.findMany({ where: { ownerId: actor.id }, orderBy: { createdAt: "desc" }, take: 30, include: { from: { select: { id: true, displayName: true, primaryRole: true } }, to: { select: { displayName: true } } } }),
    db.collaborationContract.findMany({ where: { ownerId: actor.id }, orderBy: { createdAt: "desc" }, include: { professional: { select: { displayName: true } }, _count: { select: { products: true } } } }),
    db.user.findUniqueOrThrow({ where: { id: actor.id } }),
  ]);
  const pending = offers.filter((o) => o.status === "PENDING");
  return (
    <>
      <PageHeader eyebrow="Délégation" title="Confier mes ventes à un indépendant"
        subtitle="Un commercial vérifié photographie, publie, négocie et suit vos ventes. Vous restez propriétaire, vous validez les prix, et vous suivez tout en temps réel."
        action={<ButtonLink href="/independants" variant="accent"><Briefcase className="h-4 w-4" />Choisir dans l&apos;annuaire</ButtonLink>} />

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {[["1", "Publiez une demande", "ou choisissez directement un indépendant dans l'annuaire."], ["2", "Comparez les propositions", "commission, formule, profil, avis et résultats."], ["3", "Validez et suivez", "vous confiez les articles, il vend, vous validez chaque prix."]].map(([n, t, d]) => (
          <Card key={n} className="p-4"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">{n}</span><p className="mt-2 font-medium">{t}</p><p className="text-sm text-ink-3">{d}</p></Card>
        ))}
      </div>

      {pending.length > 0 && (
        <Card className="mb-6">
          <CardHeader title={`Propositions à examiner (${pending.length})`} />
          <ul className="divide-y divide-line">
            {pending.map((o) => (
              <li key={o.id} className="flex flex-wrap items-start gap-4 p-5">
                <Avatar name={o.from.displayName} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{o.fromUserId === actor.id ? <>Votre demande à {o.to.displayName}</> : <Link href={`/independants/${o.from.id}`} className="hover:underline">{o.from.displayName}</Link>}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-sm"><Badge tone="pro">{formatBps(o.commissionBps)} de commission</Badge><Badge>{modeLabel[o.mode]}</Badge><Badge>{o.durationDays} jours</Badge></div>
                  <p className="mt-2 whitespace-pre-line text-sm text-ink-2">{o.message}</p>
                  <p className="mt-1 text-xs text-ink-3">Sur 100 € de vente : vous recevez {formatEUR(10000 - o.commissionBps)}. · {timeAgo(o.createdAt)}</p>
                </div>
                {o.toUserId === actor.id ? (
                  <div className="flex gap-2">
                    <ActionButton action={respondAction} fields={{ offerId: o.id, decision: "accept" }} variant="accent" confirm="Accepter cette collaboration ? Les conditions financières seront figées.">Accepter</ActionButton>
                    <ActionButton action={respondAction} fields={{ offerId: o.id, decision: "refuse" }}>Refuser</ActionButton>
                  </div>
                ) : <ActionButton action={withdrawOfferAction} fields={{ offerId: o.id }} variant="ghost">Retirer</ActionButton>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader title="Mes collaborations" />
        {!contracts.length ? <div className="p-5"><EmptyState title="Aucune collaboration" text="Acceptez une proposition ou contactez un indépendant pour démarrer." /></div> : (
          <ul className="divide-y divide-line">{contracts.map((c) => (
            <li key={c.id}><Link href={`/collaborations/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-canvas">
              <div><p className="font-medium">{c.professional.displayName}</p><p className="text-sm text-ink-3">{formatBps(c.commissionBps)} · {modeLabel[c.mode]} · {c._count.products} article(s) · jusqu&apos;au {formatDate(c.endsAt)}</p></div>
              <Badge tone={c.status === "ACTIVE" ? "success" : "neutral"}>{c.status === "ACTIVE" ? "Active" : "Terminée"}</Badge>
            </Link></li>
          ))}</ul>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Publier une demande d'accompagnement" subtitle="Visible par les indépendants vérifiés, qui pourront vous faire une proposition." />
          <Form action={createRequestAction} className="space-y-4 p-5" resetOnSuccess>
            <Field label="Titre"><Input name="title" required placeholder="Ex. Une vingtaine de vêtements de marque" /></Field>
            <Field label="Description"><Textarea name="description" required placeholder="Types d'articles, marques, état, disponibilités…" /></Field>
            <fieldset><legend className="mb-1.5 text-sm font-medium">Catégories</legend>
              <div className="grid grid-cols-2 gap-1.5">{categories.map((c) => <Checkbox key={c.slug} name="categorySlugs" value={c.slug} label={c.name} />)}</div></fieldset>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Ville"><Input name="city" required defaultValue={user.city ?? ""} /></Field>
              <Field label="Code postal"><Input name="postalCode" defaultValue={user.postalCode ?? ""} /></Field>
              <Field label="Nombre d'articles (estimation)"><Input name="estimatedItems" type="number" min={1} defaultValue={5} required /></Field>
              <Field label="Valeur estimée (€)"><Input name="estimatedValue" inputMode="decimal" /></Field>
              <Field label="Formule souhaitée"><Select name="mode"><option value="SALES_ONLY">Commercialisation (j&apos;expédie)</option><option value="FULL_SERVICE">Service complet (récupération incluse)</option></Select></Field>
              <Field label="Commission maximale (%)" hint={`Bornes : ${formatBps(settings.delegationCommissionMinBps)} – ${formatBps(settings.delegationCommissionMaxBps)}`}><Input name="maxCommission" inputMode="decimal" placeholder="25" /></Field>
            </div>
            <Submit variant="accent">Publier ma demande</Submit>
          </Form>
        </Card>
        <Card>
          <CardHeader title="Mes demandes" />
          {!requests.length ? <div className="p-5"><EmptyState title="Aucune demande publiée" /></div> : (
            <ul className="divide-y divide-line">{requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-4">
                <div><p className="font-medium">{r.title}</p><p className="text-sm text-ink-3">{r.city} · {r.estimatedItems} articles · {r._count.offers} proposition(s)</p></div>
                <div className="flex items-center gap-2"><Badge tone={r.status === "OPEN" ? "success" : "neutral"}>{{ OPEN: "Ouverte", MATCHED: "Pourvue", CLOSED: "Fermée" }[r.status]}</Badge>
                  {r.status === "OPEN" && <ActionButton action={closeRequestAction} fields={{ requestId: r.id }} variant="ghost">Fermer</ActionButton>}</div>
              </li>
            ))}</ul>
          )}
          {offers.filter((o) => o.status !== "PENDING").length > 0 && (
            <div className="border-t border-line p-4 text-sm"><p className="mb-2 font-medium">Historique des propositions</p>
              <ul className="space-y-1 text-ink-2">{offers.filter((o) => o.status !== "PENDING").map((o) => <li key={o.id}>{o.from.displayName} · {formatBps(o.commissionBps)} · {offerStatusLabel[o.status]}</li>)}</ul></div>
          )}
        </Card>
      </div>
    </>
  );
}
