import { adminDashboard } from "@/server/services/stats";
import { Card, CardHeader, PageHeader, Stat, StatGrid } from "@/components/ui";
import { BarsChart, TrendChart } from "@/components/charts/Charts";
import { saleTypeLabel } from "@/lib/labels";
import { formatEUR } from "@/lib/money";
import { pct } from "@/lib/format";
import type { SaleType } from "@prisma/client";

export const metadata = { title: "Administration" };
export default async function AdminHome() {
  const d = await adminDashboard();
  return (
    <>
      <PageHeader eyebrow="Pilotage" title="Vue d'ensemble de la marketplace" />
      <StatGrid>
        <Stat label="Utilisateurs" value={d.users} hint={`${d.individuals} particuliers · ${d.professionals} indépendants · ${d.suppliers} fournisseurs`} />
        <Stat label="Produits" value={d.products} hint={`${d.activeProducts} annonces actives`} />
        <Stat label="Commandes payées" value={d.orders} />
        <Stat label="Volume de transactions" value={formatEUR(d.gmv)} />
        <Stat label="CA plateforme" value={formatEUR(d.platformRevenue)} hint={`${formatEUR(d.platformRevenueRealized)} acquis (délais écoulés)`} />
        <Stat label="Commissions générées" value={formatEUR(d.commissionsGenerated)} hint={`${formatEUR(d.commissionsPending)} en attente · ${formatEUR(d.commissionsPaid)} versées`} />
        <Stat label="Litiges ouverts" value={d.disputes} />
        <Stat label="Conversion des liens" value={pct(d.affiliateConversion, 1)} hint={`${d.clicks} clics sur liens commerciaux`} />
      </StatGrid>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card><CardHeader title="Volume quotidien" subtitle="30 derniers jours" /><div className="p-4"><TrendChart data={d.gmvDaily} /></div></Card>
        <Card><CardHeader title="Volume mensuel" /><div className="p-4"><BarsChart data={d.gmvMonthly} /></div></Card>
        <Card><CardHeader title="Ventes par type" /><div className="p-4"><BarsChart money={false} data={d.saleTypes.map((s) => ({ label: saleTypeLabel[s.label as SaleType], value: s.value }))} /></div></Card>
      </div>
    </>
  );
}
