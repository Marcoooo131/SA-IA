import { db } from "@/server/db";
import { Button, Card, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export default async function Audit({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const logs = await db.auditLog.findMany({ where: q ? { OR: [{ action: { contains: q } }, { entityId: q }, { entityType: q }] } : {}, orderBy: { createdAt: "desc" }, take: 200, include: { actor: { select: { displayName: true } } } });
  return (
    <>
      <PageHeader title="Journal d'audit" subtitle="Opérations sensibles : connexions, paramètres, modération, remboursements, versements, rôles…" />
      <form className="mb-4 flex gap-2"><Input name="q" placeholder="Action (ex. settings, payout) ou identifiant" defaultValue={q} /><Button variant="dark">Filtrer</Button></form>
      <Card><Table><thead><tr><Th>Date</Th><Th>Auteur</Th><Th>Action</Th><Th>Objet</Th><Th>Détails</Th></tr></thead>
        <tbody>{logs.map((l) => <tr key={l.id}><Td className="whitespace-nowrap text-xs text-ink-3">{formatDateTime(l.createdAt)}</Td><Td>{l.actor?.displayName ?? "Système"}</Td><Td className="font-mono text-xs">{l.action}</Td><Td className="text-xs">{l.entityType} <span className="text-ink-3">{l.entityId?.slice(-10)}</span></Td><Td className="max-w-md truncate font-mono text-[11px] text-ink-3">{l.metadata ? JSON.stringify(l.metadata) : ""}</Td></tr>)}</tbody></Table></Card>
    </>
  );
}
