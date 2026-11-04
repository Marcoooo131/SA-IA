import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui";
import { OrderList } from "@/components/OrderList";

export default async function Purchases() {
  const actor = await requireActor();
  const orders = await db.order.findMany({ where: { buyerId: actor.id, status: { not: "PENDING_PAYMENT" } }, orderBy: { createdAt: "desc" }, include: { seller: { select: { displayName: true } }, items: { include: { product: { include: { images: { take: 1 } } } } } } });
  return (<><PageHeader title="Mes achats" subtitle="Suivez vos commandes, confirmez la réception, laissez un avis ou signalez un problème." />
    <OrderList orders={orders.map((o) => ({ ...o, counterpart: o.seller.displayName }))} empty="Aucun achat pour le moment" /></>);
}
