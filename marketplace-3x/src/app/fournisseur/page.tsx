import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { supplierDashboard } from "@/server/services/stats";
import { db } from "@/server/db";
import { ButtonLink, Card, CardHeader, PageHeader, Stat, StatGrid, Table, Td, Th } from "@/components/ui";
import { BarsChart } from "@/components/charts/Charts";
import { formatEUR } from "@/lib/money";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Espace fournisseur" };
export default async function SupplierHome() {
  const actor = await requireActor();
  const [d, payouts] = await Promise.all([supplierDashboard(actor.id), db.payout.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" }, take: 5 })]);
  return (
    <>
      <PageHeader eyebrow="Fournisseur" title="Tableau de bord" action={<><ButtonLink href="/fournisseur/produits/nouveau" variant="accent">Ajouter un produit</ButtonLink><ButtonLink href="/fournisseur/import" variant="secondary">Importer</ButtonLink></>} />
      <StatGrid>
        <Stat label="Références publiées" value={d.products} hint={`${d.active} actives`} />
        <Stat label="Commandes" value={d.orders} hint={`${d.toShip} à expédier`} />
        <Stat label="Chiffre d'affaires" value={formatEUR(d.revenue)} />
        <Stat label="Indépendants partenaires" value={d.professionals} hint="ont sélectionné vos produits" />
        <Stat label="Commissions générées" value={formatEUR(d.commissionsGenerated)} hint="versées au réseau et à la plateforme" />
        <Stat label="Revenus en validation" value={formatEUR(d.balances.validating + d.balances.validated)} />
        <Stat label="Revenus disponibles" value={formatEUR(d.balances.available)} />
        <Stat label="Déjà versés" value={formatEUR(d.balances.paid)} />
      </StatGrid>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card><CardHeader title="Chiffre d'affaires mensuel" /><div className="p-4"><BarsChart data={d.monthly} /></div></Card>
        <Card><CardHeader title="Produits les plus vendus" />
          {d.topProducts.length ? <Table><thead><tr><Th>Produit</Th><Th>Quantité</Th><Th className="text-right">CA</Th></tr></thead><tbody>{d.topProducts.map((t) => <tr key={t.title}><Td>{t.title}</Td><Td>{t.qty}</Td><Td className="text-right">{formatEUR(t.revenue)}</Td></tr>)}</tbody></Table> : <p className="p-5 text-sm text-ink-3">Aucune vente.</p>}
        </Card>
        <Card><CardHeader title="Historique des paiements" action={<Link href="/fournisseur/finances" className="text-sm underline">Détail</Link>} />
          {payouts.length ? <ul className="divide-y divide-line text-sm">{payouts.map((p) => <li key={p.id} className="flex justify-between p-4"><span>{formatDate(p.createdAt)}</span><strong>{formatEUR(p.amountCents)}</strong></li>)}</ul> : <p className="p-5 text-sm text-ink-3">Aucun versement pour le moment.</p>}
        </Card>
      </div>
    </>
  );
}
