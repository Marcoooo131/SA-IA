import Link from "next/link";
import { db } from "@/server/db";
import { Badge, Button, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { ActionButton } from "@/components/ui/Form";
import { refundAction } from "@/app/actions/admin";
import { orderTone } from "@/components/OrderList";
import { orderStatusLabel } from "@/lib/labels";
import { formatEUR } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import type { OrderStatus } from "@prisma/client";

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ q?: string; s?: string }> }) {
  const sp = await searchParams;
  const orders = await db.order.findMany({
    where: { ...(sp.s ? { status: sp.s as OrderStatus } : {}), ...(sp.q ? { number: { contains: sp.q, mode: "insensitive" } } : {}) },
    orderBy: { createdAt: "desc" }, take: 100, include: { buyer: { select: { displayName: true } }, seller: { select: { displayName: true } }, payment: { select: { provider: true } } },
  });
  return (
    <>
      <PageHeader title="Commandes" />
      <form className="mb-4 flex flex-wrap gap-2"><Input name="q" placeholder="N° de commande" defaultValue={sp.q} className="max-w-xs" />
        <Select name="s" defaultValue={sp.s ?? ""} className="max-w-xs"><option value="">Tous statuts</option>{Object.entries(orderStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select><Button variant="dark">Filtrer</Button></form>
      <div className="rounded-[var(--radius)] border border-line bg-white"><Table>
        <thead><tr><Th>Commande</Th><Th>Acheteur → vendeur</Th><Th>Statut</Th><Th>Total</Th><Th /></tr></thead>
        <tbody>{orders.map((o) => (
          <tr key={o.id}>
            <Td><Link href={`/commandes/${o.id}`} className="font-medium hover:underline">{o.number}</Link><p className="text-xs text-ink-3">{formatDateTime(o.createdAt)}{o.payment?.provider === "demo" && " · démo"}</p></Td>
            <Td>{o.buyer.displayName} → {o.seller.displayName}</Td>
            <Td><Badge tone={orderTone[o.status]}>{orderStatusLabel[o.status]}</Badge></Td>
            <Td>{formatEUR(o.totalCents)}</Td>
            <Td className="text-right">{["PAID", "SHIPPED", "DELIVERED", "COMPLETED", "DISPUTED"].includes(o.status) && <ActionButton action={refundAction} fields={{ orderId: o.id, reason: "Remboursement décidé par l'administration", restock: "on" }} variant="danger" confirm={`Rembourser intégralement ${formatEUR(o.totalCents)} ?`}>Rembourser</ActionButton>}</Td>
          </tr>))}</tbody>
      </Table></div>
    </>
  );
}
