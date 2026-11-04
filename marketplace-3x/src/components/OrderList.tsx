import Link from "next/link";
import Image from "next/image";
import type { OrderStatus } from "@prisma/client";
import { Badge, EmptyState } from "@/components/ui";
import { orderStatusLabel } from "@/lib/labels";
import { formatEUR } from "@/lib/money";
import { formatDate } from "@/lib/format";

export const orderTone: Record<OrderStatus, "neutral" | "success" | "warning" | "danger" | "info" | "brand"> = {
  PENDING_PAYMENT: "neutral", PAID: "warning", SHIPPED: "info", DELIVERED: "info", COMPLETED: "success", CANCELLED: "neutral", REFUNDED: "neutral", DISPUTED: "danger",
};

type O = { id: string; number: string; status: OrderStatus; totalCents: number; createdAt: Date; items: { title: string; product: { images: { url: string }[] } }[]; counterpart?: string };

export function OrderList({ orders, empty }: { orders: O[]; empty: string }) {
  if (!orders.length) return <EmptyState title={empty} />;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius)] border border-line bg-white">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/commandes/${o.id}`} className="flex items-center gap-4 p-4 transition hover:bg-canvas">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-black/5">{o.items[0]?.product.images[0] && <Image src={o.items[0].product.images[0].url} alt="" fill sizes="56px" className="object-cover" />}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{o.items.map((i) => i.title).join(", ")}</p>
              <p className="text-xs text-ink-3">{o.number} · {formatDate(o.createdAt)}{o.counterpart ? ` · ${o.counterpart}` : ""}</p>
            </div>
            <div className="text-right"><p className="font-semibold">{formatEUR(o.totalCents)}</p><Badge tone={orderTone[o.status]}>{orderStatusLabel[o.status]}</Badge></div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
