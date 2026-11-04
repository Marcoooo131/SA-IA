import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { PageHeader, Tabs } from "@/components/ui";
import { OrderList } from "@/components/OrderList";
import type { OrderStatus } from "@prisma/client";

export default async function Sales({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const actor = await requireActor();
  const { f } = await searchParams;
  const statusFilter: Record<string, OrderStatus[]> = { ship: ["PAID"], progress: ["SHIPPED", "DELIVERED", "DISPUTED"], done: ["COMPLETED", "REFUNDED", "CANCELLED"] };
  const orders = await db.order.findMany({
    where: { sellerId: actor.id, paidAt: { not: null }, ...(f && statusFilter[f] ? { status: { in: statusFilter[f] } } : {}) }, orderBy: { createdAt: "desc" },
    include: { buyer: { select: { displayName: true } }, items: { include: { product: { include: { images: { take: 1 } } } } } },
  });
  const base = actor.primaryRole === "SUPPLIER" ? "/fournisseur/commandes" : "/espace/ventes";
  return (<><PageHeader title={actor.primaryRole === "SUPPLIER" ? "Commandes" : "Mes ventes"} subtitle="Expédiez rapidement : vous êtes payé dès la confirmation de réception et la fin du délai de validation." />
    <Tabs current={f ? `${base}?f=${f}` : base} items={[{ href: base, label: "Toutes" }, { href: `${base}?f=ship`, label: "À expédier" }, { href: `${base}?f=progress`, label: "En cours" }, { href: `${base}?f=done`, label: "Terminées" }]} />
    <OrderList orders={orders.map((o) => ({ ...o, counterpart: `Acheteur : ${o.buyer.displayName}` }))} empty="Aucune commande ici" /></>);
}
