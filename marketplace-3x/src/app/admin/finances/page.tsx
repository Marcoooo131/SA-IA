import Link from "next/link";
import { db } from "@/server/db";
import { getCommerceSettings } from "@/server/settings";
import { Badge, ButtonLink, Card, CardHeader, PageHeader, Stat, StatGrid, Table, Td, Th } from "@/components/ui";
import { ActionButton } from "@/components/ui/Form";
import { payoutAction, runJobsAction } from "@/app/actions/admin";
import { paymentStatusLabel } from "@/lib/labels";
import { formatEUR } from "@/lib/money";
import { formatDateTime } from "@/lib/format";

export default async function Finance() {
  const settings = await getCommerceSettings();
  const [payable, payments, payouts, refunds, ledger, byStatus, clawbacks] = await Promise.all([
    db.commissionTransaction.groupBy({ by: ["beneficiaryId"], where: { status: "AVAILABLE", payoutId: null, beneficiaryId: { not: null } }, _sum: { amountCents: true } }),
    db.payment.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { buyer: { select: { displayName: true } } } }),
    db.payout.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { user: { select: { displayName: true } } } }),
    db.refund.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { order: { select: { number: true } } } }),
    db.ledgerEntry.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    db.commissionTransaction.groupBy({ by: ["status", "beneficiary"], _sum: { amountCents: true } }),
    db.ledgerEntry.aggregate({ where: { event: "CLAWBACK_DUE" }, _sum: { amountCents: true } }),
  ]);
  const users = await db.user.findMany({ where: { id: { in: payable.map((p) => p.beneficiaryId!) } }, include: { payoutAccount: true } });
  const sum = (b: string, st: string[]) => byStatus.filter((x) => x.beneficiary === b && st.includes(x.status)).reduce((a, x) => a + (x._sum.amountCents ?? 0), 0);
  return (
    <>
      <PageHeader title="Finances" subtitle="Transactions, répartitions, versements et remboursements — chaque mouvement est inscrit au journal financier."
        action={<><ActionButton action={runJobsAction} variant="secondary" size="md">Lancer les validations</ActionButton><ButtonLink href="/api/export/commissions" variant="secondary">Export commissions (CSV)</ButtonLink><ButtonLink href="/api/export/ledger" variant="secondary">Export journal</ButtonLink><ButtonLink href="/api/export/dac7" variant="secondary">Pré-rapport DAC7</ButtonLink></>} />
      <StatGrid>
        <Stat label="Revenu net plateforme acquis" value={formatEUR(sum("PLATFORM", ["AVAILABLE", "PAID"]))} hint={`${formatEUR(sum("PLATFORM", ["VALIDATING", "VALIDATED"]))} en validation · net des remises promo`} />
        <Stat label="Commissions indépendants dues" value={formatEUR(sum("PROFESSIONAL", ["AVAILABLE"]))} hint={`${formatEUR(sum("PROFESSIONAL", ["PAID"]))} versées`} />
        <Stat label="Revenus vendeurs dus" value={formatEUR(sum("SELLER", ["AVAILABLE"]) + sum("SUPPLIER", ["AVAILABLE"]))} />
        <Stat label="Créances à recouvrer" value={formatEUR(Math.abs(clawbacks._sum.amountCents ?? 0))} hint="Remboursements après versement" />
      </StatGrid>
      <Card className="mt-6"><CardHeader title="Versements à effectuer" subtitle={`Montants disponibles par bénéficiaire (minimum ${formatEUR(settings.minPayoutCents)}, compte vérifié requis)`} />
        {!payable.length ? <p className="p-5 text-sm text-ink-3">Aucun montant disponible.</p> : (
          <Table><thead><tr><Th>Bénéficiaire</Th><Th>Compte</Th><Th className="text-right">Disponible</Th><Th /></tr></thead>
            <tbody>{payable.map((p) => { const u = users.find((x) => x.id === p.beneficiaryId); return (
              <tr key={p.beneficiaryId}><Td><Link href={`/admin/utilisateurs/${p.beneficiaryId}`} className="hover:underline">{u?.displayName}</Link></Td>
                <Td><Badge tone={u?.payoutAccount?.status === "VERIFIED" ? "success" : "warning"}>{u?.payoutAccount?.status ?? "Aucun"}</Badge>{u?.payoutAccount?.provider === "demo" && <span className="ml-1 text-xs text-ink-3">démo</span>}</Td>
                <Td className="text-right font-semibold">{formatEUR(p._sum.amountCents ?? 0)}</Td>
                <Td className="text-right"><ActionButton action={payoutAction} fields={{ userId: p.beneficiaryId! }} variant="accent" confirm="Déclencher le transfert vers ce bénéficiaire ?">Verser</ActionButton></Td></tr>); })}</tbody></Table>
        )}
      </Card>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card><CardHeader title="Paiements" /><Table><thead><tr><Th>Date</Th><Th>Acheteur</Th><Th>Statut</Th><Th className="text-right">Montant</Th></tr></thead>
          <tbody>{payments.map((p) => <tr key={p.id}><Td className="text-xs text-ink-3">{formatDateTime(p.createdAt)}<br />{p.provider}</Td><Td>{p.buyer.displayName}</Td><Td><Badge>{paymentStatusLabel[p.status]}</Badge></Td><Td className="text-right">{formatEUR(p.amountCents)}</Td></tr>)}</tbody></Table></Card>
        <Card><CardHeader title="Versements" /><Table><thead><tr><Th>Date</Th><Th>Bénéficiaire</Th><Th>Statut</Th><Th className="text-right">Montant</Th></tr></thead>
          <tbody>{payouts.map((p) => <tr key={p.id}><Td className="text-xs text-ink-3">{formatDateTime(p.createdAt)}</Td><Td>{p.user.displayName}</Td><Td><Badge tone={p.status === "PAID" ? "success" : "danger"}>{p.status}</Badge></Td><Td className="text-right">{formatEUR(p.amountCents)}</Td></tr>)}</tbody></Table></Card>
        <Card><CardHeader title="Remboursements" /><Table><thead><tr><Th>Date</Th><Th>Commande</Th><Th>Motif</Th><Th className="text-right">Montant</Th></tr></thead>
          <tbody>{refunds.map((r) => <tr key={r.id}><Td className="text-xs text-ink-3">{formatDateTime(r.createdAt)}</Td><Td>{r.order.number}</Td><Td className="max-w-48 truncate text-xs">{r.reason}</Td><Td className="text-right">{formatEUR(r.amountCents)}</Td></tr>)}</tbody></Table></Card>
        <Card><CardHeader title="Journal financier (derniers mouvements)" /><Table><thead><tr><Th>Date</Th><Th>Événement</Th><Th>Compte</Th><Th className="text-right">Montant</Th></tr></thead>
          <tbody>{ledger.map((l) => <tr key={l.id}><Td className="text-xs text-ink-3">{formatDateTime(l.createdAt)}</Td><Td className="font-mono text-xs">{l.event}</Td><Td className="font-mono text-xs">{l.accountRef.replace(/user:(\w{6})\w+/, "user:$1…")}</Td><Td className="text-right">{formatEUR(l.amountCents)}</Td></tr>)}</tbody></Table></Card>
      </div>
    </>
  );
}
