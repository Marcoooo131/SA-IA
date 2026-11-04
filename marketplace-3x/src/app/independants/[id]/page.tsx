import { notFound } from "next/navigation";
import { BadgeCheck, MapPin, Truck } from "lucide-react";
import { db } from "@/server/db";
import { getActor } from "@/server/auth/session";
import { getCommerceSettings } from "@/server/settings";
import { reputation } from "@/server/services/orders";
import { professionalDashboard } from "@/server/services/stats";
import { Avatar, Badge, Card, Container, Field, Input, Select, Stars, Textarea, Alert, ButtonLink } from "@/components/ui";
import { Form, Submit } from "@/components/ui/Form";
import { requestProAction } from "@/app/actions/delegation";
import { formatBps, formatEUR } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { ProductGrid } from "@/components/product/ProductCard";
import { publicProductInclude, publicVisibilityWhere } from "@/server/services/catalog";

export default async function ProProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pro = await db.professionalProfile.findUnique({ where: { userId: id }, include: { user: true } });
  if (!pro || pro.user.status !== "ACTIVE") notFound();
  const actor = await getActor();
  const settings = await getCommerceSettings();
  const [rep, reviews, stats, categories, managed] = await Promise.all([
    reputation(id),
    db.review.findMany({ where: { targetId: id }, orderBy: { createdAt: "desc" }, take: 10, include: { author: { select: { displayName: true } } } }),
    professionalDashboard(id),
    db.category.findMany(),
    db.product.findMany({ where: { AND: [await publicVisibilityWhere(), { contract: { professionalId: id, status: "ACTIVE" } }] }, include: publicProductInclude, take: 8 }),
  ]);
  const canRequest = actor && actor.id !== id && actor.roles.includes("INDIVIDUAL");
  return (
    <Container className="accent-pro py-10">
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="flex items-start gap-4">
            <Avatar name={pro.user.displayName} size={84} />
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-semibold">{pro.user.displayName}{pro.verificationStatus === "VERIFIED" && <BadgeCheck className="h-6 w-6 text-pro" aria-label="Profil vérifié" />}</h1>
              <p className="mt-1 text-lg text-ink-2">{pro.headline}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-ink-3">
                {pro.serviceArea && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{pro.serviceArea} · {pro.serviceRadiusKm} km</span>}
                {pro.offersPickup && <span className="inline-flex items-center gap-1"><Truck className="h-4 w-4" />Récupère, prépare et expédie</span>}
                <span>Membre depuis {formatDate(pro.user.createdAt)}</span>
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {pro.verificationStatus === "VERIFIED" ? <Badge tone="success">Identité et SIRET vérifiés</Badge> : <Badge tone="warning">Vérification en cours</Badge>}
            {pro.categorySlugs.map((c) => <Badge key={c} tone="pro">{categories.find((x) => x.slug === c)?.name ?? c}</Badge>)}
            {pro.specialties.map((s) => <Badge key={s}>{s}</Badge>)}
          </div>
          {pro.bio && <p className="mt-6 whitespace-pre-line leading-relaxed text-ink-2">{pro.bio}</p>}
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[["Ventes réalisées", rep.sales], ["Note moyenne", rep.count ? `${rep.average.toFixed(1)} / 5` : "—"], ["Particuliers accompagnés", stats.individualsAccompanied], ["Indice de fiabilité", `${rep.reliability} / 100`]].map(([l, v]) => (
              <Card key={String(l)} className="p-4"><p className="text-xs text-ink-3">{l}</p><p className="mt-1 text-xl font-semibold">{v}</p></Card>
            ))}
          </div>
          <h2 className="mb-3 mt-10 text-lg font-semibold">Avis clients</h2>
          {reviews.length ? (
            <ul className="space-y-3">{reviews.map((r) => (
              <li key={r.id} className="rounded-2xl bg-white p-4 text-sm">
                <div className="flex justify-between"><span className="font-medium">{r.author.displayName}</span><Stars value={r.rating} /></div>
                {r.comment && <p className="mt-1 text-ink-2">{r.comment}</p>}<p className="mt-1 text-xs text-ink-3">{formatDate(r.createdAt)}</p>
              </li>))}</ul>
          ) : <p className="text-sm text-ink-3">Aucun avis pour le moment.</p>}
          {managed.length > 0 && <><h2 className="mb-4 mt-10 text-lg font-semibold">Articles actuellement en vente</h2><ProductGrid products={managed} /></>}
        </div>
        <aside>
          <Card className="sticky top-24 p-5">
            <p className="text-sm text-ink-3">Commission habituelle</p>
            <p className="text-3xl font-semibold">{formatBps(pro.defaultCommissionBps)}</p>
            <p className="mt-1 text-xs text-ink-3">Exemple : pour une vente de 100 €, l&apos;indépendant perçoit {formatEUR(pro.defaultCommissionBps / 100 * 100)} avant frais de plateforme ; vous recevez {formatEUR(10000 - pro.defaultCommissionBps)}.</p>
            {canRequest ? (
              <Form action={requestProAction} className="mt-5 space-y-3">
                <input type="hidden" name="professionalId" value={id} />
                <Field label="Commission proposée (%)" hint={`Entre ${formatBps(settings.delegationCommissionMinBps)} et ${formatBps(settings.delegationCommissionMaxBps)}`}>
                  <Input name="commission" inputMode="decimal" defaultValue={(pro.defaultCommissionBps / 100).toString()} required />
                </Field>
                <Field label="Formule">
                  <Select name="mode" defaultValue="SALES_ONLY">
                    <option value="SALES_ONLY">Il commercialise, j&apos;expédie</option>
                    {pro.offersPickup && <option value="FULL_SERVICE">Il récupère, prépare et expédie</option>}
                  </Select>
                </Field>
                <Field label="Durée (jours)"><Input name="durationDays" type="number" min={7} max={settings.collaborationMaxDurationDays} defaultValue={90} /></Field>
                <Field label="Votre message"><Textarea name="message" required placeholder="Décrivez les articles que vous souhaitez confier…" /></Field>
                <Submit className="w-full">Envoyer ma demande</Submit>
                <p className="text-xs text-ink-3">Vous conservez la propriété de vos articles et validez chaque prix.</p>
              </Form>
            ) : actor ? (
              actor.id === id ? <ButtonLink href="/pro/profil" className="mt-5 w-full" variant="accent">Modifier mon profil</ButtonLink> : <Alert tone="info">Seuls les comptes particuliers peuvent confier leurs ventes.</Alert>
            ) : <ButtonLink href={`/connexion?next=/independants/${id}`} variant="accent" className="mt-5 w-full">Se connecter pour le contacter</ButtonLink>}
          </Card>
        </aside>
      </div>
    </Container>
  );
}
