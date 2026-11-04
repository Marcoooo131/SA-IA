import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { professionalAdvice, professionalDashboard } from "@/server/services/stats";
import { Card, CardHeader, PageHeader, Stat, StatGrid, ButtonLink } from "@/components/ui";
import { BarsChart, TrendChart } from "@/components/charts/Charts";
import { formatEUR } from "@/lib/money";
import { pct } from "@/lib/format";

export const metadata = { title: "Espace indépendant" };
export default async function ProDashboard() {
  const actor = await requireActor();
  const d = await professionalDashboard(actor.id);
  const tips = professionalAdvice(d);
  return (
    <>
      <PageHeader eyebrow="Indépendant" title="Tableau de bord" subtitle="Votre activité commerciale en un coup d'œil." action={<><ButtonLink href="/pro/prospection" variant="accent">Prospecter</ButtonLink><ButtonLink href="/pro/catalogue" variant="secondary">Catalogue</ButtonLink></>} />
      <StatGrid>
        <Stat label="Chiffre d'affaires généré" value={formatEUR(d.revenue)} />
        <Stat label="Ventes réalisées" value={d.salesDone} hint={`${d.salesInProgress} en cours`} />
        <Stat label="Commissions générées" value={formatEUR(d.commissionsGenerated)} hint={`Moyenne ${formatEUR(d.avgCommission)} / vente`} />
        <Stat label="En attente de validation" value={formatEUR(d.commissionsPending)} />
        <Stat label="Commissions disponibles" value={formatEUR(d.commissionsAvailable)} hint={`${formatEUR(d.commissionsPaid)} déjà versées`} />
        <Stat label="Clients apportés" value={d.clientsBrought} />
        <Stat label="Particuliers accompagnés" value={d.individualsAccompanied} hint={`${d.activeContracts} collaboration(s) active(s)`} />
        <Stat label="Fournisseurs partenaires" value={d.supplierPartners} hint={`Conversion des liens : ${pct(d.conversionRate, 1)} · ${d.clicks} clics`} />
      </StatGrid>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card><CardHeader title="Revenus journaliers" subtitle="Commissions des 30 derniers jours" /><div className="p-4"><TrendChart data={d.daily} /></div></Card>
        <Card><CardHeader title="Revenus mensuels" /><div className="p-4"><BarsChart data={d.monthly} /></div></Card>
        <Card><CardHeader title="Nombre de ventes" /><div className="p-4"><BarsChart data={d.salesMonthly} money={false} /></div></Card>
        <Card><CardHeader title="Performances par catégorie" subtitle="Commissions" /><div className="p-4">{d.byCategory.length ? <BarsChart data={d.byCategory} /> : <p className="text-sm text-ink-3">Pas encore de données.</p>}</div></Card>
        <Card><CardHeader title="Performances par fournisseur" subtitle="Chiffre d'affaires apporté" /><div className="p-4">{d.bySupplier.length ? <BarsChart data={d.bySupplier} /> : <p className="text-sm text-ink-3">Sélectionnez des produits dans le <Link href="/pro/catalogue" className="underline">catalogue</Link>.</p>}</div></Card>
        <Card><CardHeader title="Conseils personnalisés" subtitle="Basés sur vos performances" />
          <ul className="space-y-3 p-5 text-sm">{tips.map((t) => <li key={t} className="flex gap-2"><Lightbulb className="h-4 w-4 shrink-0 text-pro" /><span className="text-ink-2">{t}</span></li>)}</ul></Card>
      </div>
    </>
  );
}
