import Link from "next/link";
import { MapPin, Package } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCommerceSettings } from "@/server/settings";
import { matchScore } from "@/server/services/delegation";
import { Avatar, Badge, Button, Card, Field, Input, PageHeader, Select, Textarea, EmptyState } from "@/components/ui";
import { Form, Submit } from "@/components/ui/Form";
import { proposeAction } from "@/app/actions/delegation";
import { modeLabel } from "@/lib/labels";
import { formatBps, formatEUR } from "@/lib/money";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Prospection" };
type SP = { category?: string; city?: string; min?: string; mode?: string; tab?: string };

export default async function Prospect({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const [profile, me, settings, categories] = await Promise.all([
    db.professionalProfile.findUniqueOrThrow({ where: { userId: actor.id } }),
    db.user.findUniqueOrThrow({ where: { id: actor.id } }),
    getCommerceSettings(),
    db.category.findMany({ where: { parentId: null }, orderBy: { position: "asc" } }),
  ]);
  const verified = profile.verificationStatus === "VERIFIED";
  const requests = await db.delegationRequest.findMany({
    where: {
      status: "OPEN", ownerId: { not: actor.id }, owner: { status: "ACTIVE" },
      ...(sp.category ? { categorySlugs: { has: sp.category } } : {}),
      ...(sp.city ? { OR: [{ city: { contains: sp.city, mode: "insensitive" } }, { postalCode: { startsWith: sp.city } }] } : {}),
      ...(sp.min ? { estimatedItems: { gte: Number(sp.min) || 0 } } : {}),
      ...(sp.mode ? { mode: sp.mode as "SALES_ONLY" } : {}),
    },
    include: { owner: { select: { id: true, displayName: true, city: true, _count: { select: { products: true } } } }, offers: { where: { professionalId: actor.id } } },
    take: 100,
  });
  // Particuliers ayant des annonces ouvertes aux propositions, sans demande formelle
  const openOwners = await db.user.findMany({
    where: { id: { not: actor.id }, status: "ACTIVE", products: { some: { openToProfessionals: true, contractId: null, status: "ACTIVE", ...(sp.category ? { category: { slug: sp.category } } : {}) } } },
    include: { products: { where: { openToProfessionals: true, contractId: null, status: "ACTIVE" }, include: { category: true }, take: 6 } },
    take: 50,
  });
  const scored = requests.map((r) => ({ r, score: matchScore({ categorySlugs: profile.categorySlugs, serviceArea: profile.serviceArea, postalCode: me.postalCode, offersPickup: profile.offersPickup }, r) }))
    .sort((a, b) => b.score - a.score);
  const catName = (s: string) => categories.find((c) => c.slug === s)?.name.split(" & ")[0] ?? s;

  const ProposeForm = ({ ownerId, requestId, max }: { ownerId: string; requestId?: string; max?: number | null }) => (
    <details className="mt-3">
      <summary className="inline-flex cursor-pointer list-none rounded-full bg-pro px-4 py-2 text-sm font-medium text-white">Faire une proposition</summary>
      <Form action={proposeAction} className="mt-3 grid gap-3 rounded-2xl bg-canvas p-4 md:grid-cols-3">
        <input type="hidden" name="ownerId" value={ownerId} />{requestId && <input type="hidden" name="requestId" value={requestId} />}
        <Field label="Commission (%)" hint={`${formatBps(settings.delegationCommissionMinBps)} – ${formatBps(max ?? settings.delegationCommissionMaxBps)}`}><Input name="commission" defaultValue={(profile.defaultCommissionBps / 100).toString()} required /></Field>
        <Field label="Formule"><Select name="mode"><option value="SALES_ONLY">Commercialisation</option>{profile.offersPickup && <option value="FULL_SERVICE">Service complet</option>}</Select></Field>
        <Field label="Durée (jours)"><Input name="durationDays" type="number" defaultValue={90} min={7} max={settings.collaborationMaxDurationDays} /></Field>
        <Field label="Votre offre commerciale" className="md:col-span-3"><Textarea name="message" required placeholder="Présentez-vous, votre méthode, vos résultats et ce que vous proposez concrètement." /></Field>
        <div><Submit variant="accent">Envoyer la proposition</Submit></div>
      </Form>
    </details>
  );

  return (
    <>
      <PageHeader eyebrow="Prospection" title="Particuliers à accompagner" subtitle="Classés par pertinence selon vos spécialités et votre zone d'intervention." />
      <form className="mb-6 grid gap-3 rounded-2xl border border-line bg-white p-4 md:grid-cols-5">
        <Select name="category" defaultValue={sp.category ?? ""}><option value="">Toutes catégories</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</Select>
        <Input name="city" placeholder="Ville ou département" defaultValue={sp.city} />
        <Input name="min" type="number" placeholder="Articles min." defaultValue={sp.min} />
        <Select name="mode" defaultValue={sp.mode ?? ""}><option value="">Toutes formules</option><option value="SALES_ONLY">Commercialisation</option><option value="FULL_SERVICE">Service complet</option></Select>
        <Button variant="dark">Filtrer</Button>
      </form>
      <h2 className="mb-3 font-semibold">Demandes d&apos;accompagnement ({scored.length})</h2>
      {!scored.length ? <EmptyState title="Aucune demande ne correspond" /> : (
        <div className="space-y-3">{scored.map(({ r, score }) => (
          <Card key={r.id} className="p-5">
            <div className="flex flex-wrap items-start gap-4">
              <Avatar name={r.owner.displayName} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{r.title}</p><Badge tone={score >= 60 ? "success" : score >= 30 ? "warning" : "neutral"}>Pertinence {score} %</Badge></div>
                <p className="text-sm text-ink-3">{r.owner.displayName} · <MapPin className="inline h-3 w-3" /> {r.city} · {timeAgo(r.createdAt)}</p>
                <p className="mt-2 text-sm text-ink-2">{r.description}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {r.categorySlugs.map((c) => <Badge key={c} tone="pro">{catName(c)}</Badge>)}
                  <Badge><Package className="h-3 w-3" />{r.estimatedItems} articles</Badge>
                  {r.estimatedValueCents && <Badge>≈ {formatEUR(r.estimatedValueCents)}</Badge>}
                  <Badge>{modeLabel[r.mode]}</Badge>
                  {r.maxCommissionBps && <Badge>Commission max. {formatBps(r.maxCommissionBps)}</Badge>}
                </div>
                {r.offers.length ? <p className="mt-3 text-sm text-success">Vous avez déjà fait une proposition ({r.offers[0].status === "PENDING" ? "en attente" : r.offers[0].status.toLowerCase()}).</p>
                  : verified ? <ProposeForm ownerId={r.owner.id} requestId={r.id} max={r.maxCommissionBps} /> : <p className="mt-3 text-sm text-ink-3">Profil à vérifier avant de proposer.</p>}
              </div>
            </div>
          </Card>
        ))}</div>
      )}
      <h2 className="mb-3 mt-10 font-semibold">Particuliers ouverts aux propositions ({openOwners.length})</h2>
      <div className="grid gap-3 md:grid-cols-2">{openOwners.map((o) => (
        <Card key={o.id} className="p-5">
          <div className="flex items-center gap-3"><Avatar name={o.displayName} /><div><p className="font-medium">{o.displayName}</p><p className="text-xs text-ink-3">{o.city ?? "—"} · {o.products.length} annonce(s) ouverte(s)</p></div></div>
          <ul className="mt-3 space-y-1 text-sm">{o.products.map((p) => <li key={p.id} className="flex justify-between"><Link href={`/produit/${p.id}`} className="truncate hover:underline">{p.title}</Link><span className="shrink-0 text-ink-3">{formatEUR(p.priceCents)}</span></li>)}</ul>
          {verified && <ProposeForm ownerId={o.id} />}
        </Card>
      ))}</div>
    </>
  );
}
