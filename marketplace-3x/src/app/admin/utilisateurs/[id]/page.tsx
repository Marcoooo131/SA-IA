import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import { balances } from "@/server/services/finance";
import { reputation } from "@/server/services/orders";
import { Badge, Card, CardHeader, PageHeader, Stat, StatGrid, Table, Td, Th } from "@/components/ui";
import { ActionButton } from "@/components/ui/Form";
import { roleAction } from "@/app/actions/admin";
import { roleLabel } from "@/lib/labels";
import { formatEUR } from "@/lib/money";
import { formatDateTime } from "@/lib/format";

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await db.user.findUnique({ where: { id }, include: { roles: true, professionalProfile: true, supplierProfile: true, payoutAccount: true, _count: { select: { products: true, orders: true, sellerOrders: true } } } });
  if (!u) notFound();
  const [b, rep, logs, reports] = await Promise.all([
    balances(id), reputation(id),
    db.auditLog.findMany({ where: { OR: [{ actorId: id }, { entityId: id }] }, orderBy: { createdAt: "desc" }, take: 40 }),
    db.report.findMany({ where: { targetId: id } }),
  ]);
  const has = (r: string) => u.roles.some((x) => x.role === r);
  return (
    <>
      <PageHeader title={u.supplierProfile?.companyName ?? u.displayName} subtitle={`${u.email} · ${roleLabel[u.primaryRole]} · ${u.status}`} />
      <StatGrid>
        <Stat label="Annonces" value={u._count.products} /><Stat label="Achats" value={u._count.orders} /><Stat label="Ventes" value={u._count.sellerOrders} />
        <Stat label="Fiabilité" value={`${rep.reliability}/100`} hint={`${rep.count} avis · litiges ${Math.round(rep.disputeRate * 100)} %`} />
        <Stat label="Disponible" value={formatEUR(b.available)} /><Stat label="En validation" value={formatEUR(b.validating + b.validated)} /><Stat label="Versé" value={formatEUR(b.paid)} />
        <Stat label="Compte bénéficiaire" value={u.payoutAccount?.status ?? "—"} />
      </StatGrid>
      <Card className="mt-6"><CardHeader title="Droits d'accès" />
        <div className="flex flex-wrap gap-2 p-5">{(["INDIVIDUAL", "PROFESSIONAL", "SUPPLIER", "ADMIN"] as const).map((r) => (
          <div key={r} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">{roleLabel[r]} {has(r) ? <Badge tone="success">accordé</Badge> : <Badge>—</Badge>}
            <ActionButton action={roleAction} fields={{ userId: id, role: r, grant: has(r) ? "0" : "1" }} variant="ghost" confirm={`${has(r) ? "Retirer" : "Accorder"} le rôle ${roleLabel[r]} ?`}>{has(r) ? "Retirer" : "Accorder"}</ActionButton></div>
        ))}</div>
      </Card>
      {reports.length > 0 && <Card className="mt-6"><CardHeader title="Signalements visant ce compte" /><ul className="p-5 text-sm">{reports.map((r) => <li key={r.id}>{r.reason} · {r.status}</li>)}</ul></Card>}
      <Card className="mt-6"><CardHeader title="Historique" subtitle="Journal d'audit (actions de l'utilisateur et le concernant)" />
        <Table><thead><tr><Th>Date</Th><Th>Action</Th><Th>Objet</Th></tr></thead><tbody>{logs.map((l) => <tr key={l.id}><Td className="whitespace-nowrap text-ink-3">{formatDateTime(l.createdAt)}</Td><Td className="font-mono text-xs">{l.action}</Td><Td className="text-xs text-ink-3">{l.entityType} {l.entityId?.slice(-8)}</Td></tr>)}</tbody></Table>
      </Card>
      <p className="mt-4 text-sm"><Link href="/admin/utilisateurs" className="underline">← Retour</Link></p>
    </>
  );
}
