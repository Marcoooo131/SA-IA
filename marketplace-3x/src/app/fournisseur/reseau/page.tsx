import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { Avatar, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { formatEUR } from "@/lib/money";

export default async function Network() {
  const actor = await requireActor();
  const [selections, items, links] = await Promise.all([
    db.catalogSelection.findMany({ where: { product: { ownerId: actor.id } }, include: { professional: { select: { id: true, displayName: true, professionalProfile: { select: { serviceArea: true } } } }, product: { select: { title: true } } } }),
    db.orderItem.findMany({ where: { saleType: "SUPPLIER_AFFILIATE", order: { sellerId: actor.id, paidAt: { not: null } } }, include: { order: { select: { status: true } }, commissions: { where: { kind: "PRO_COMMISSION" } } } }),
    db.affiliateLink.findMany({ where: { product: { ownerId: actor.id } }, select: { professionalId: true, clicks: true } }),
  ]);
  const pros = new Map<string, { name: string; area: string | null; products: string[]; sales: number; inProgress: number; revenue: number; commissions: number; clicks: number }>();
  for (const s of selections) {
    const p = pros.get(s.professionalId) ?? { name: s.professional.displayName, area: s.professional.professionalProfile?.serviceArea ?? null, products: [], sales: 0, inProgress: 0, revenue: 0, commissions: 0, clicks: 0 };
    p.products.push(s.product.title); pros.set(s.professionalId, p);
  }
  for (const i of items) {
    const p = pros.get(i.professionalId!); if (!p) continue;
    if (["CANCELLED", "REFUNDED"].includes(i.order.status)) continue;
    if (i.order.status === "COMPLETED") p.sales += i.quantity; else p.inProgress += i.quantity;
    p.revenue += i.unitPriceCents * i.quantity; p.commissions += i.commissions.reduce((a, c) => a + c.amountCents, 0);
  }
  for (const l of links) { const p = pros.get(l.professionalId); if (p) p.clicks += l.clicks; }
  return (
    <>
      <PageHeader title="Réseau commercial" subtitle="Les indépendants qui recommandent vos produits et les ventes qu'ils génèrent." />
      {!pros.size ? <EmptyState title="Aucun indépendant pour le moment" text="Ouvrez vos produits au réseau avec une commission attractive pour être sélectionné." /> : (
        <Card><CardHeader title={`${pros.size} indépendant(s)`} />
          <Table><thead><tr><Th>Indépendant</Th><Th>Produits sélectionnés</Th><Th>Clics</Th><Th>Ventes</Th><Th>En cours</Th><Th>CA généré</Th><Th className="text-right">Commissions</Th></tr></thead>
            <tbody>{[...pros.entries()].map(([id, p]) => (
              <tr key={id}><Td><div className="flex items-center gap-2"><Avatar name={p.name} size={30} /><div><Link href={`/independants/${id}`} className="font-medium hover:underline">{p.name}</Link><p className="text-xs text-ink-3">{p.area}</p></div></div></Td>
                <Td className="max-w-56 truncate text-ink-2">{p.products.join(", ")}</Td><Td>{p.clicks}</Td><Td>{p.sales}</Td><Td>{p.inProgress}</Td><Td>{formatEUR(p.revenue)}</Td><Td className="text-right">{formatEUR(p.commissions)}</Td></tr>
            ))}</tbody></Table>
        </Card>
      )}
    </>
  );
}
