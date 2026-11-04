import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { modeLabel } from "@/lib/labels";
import { formatBps } from "@/lib/money";
import { formatDate } from "@/lib/format";

export default async function Collabs() {
  const actor = await requireActor();
  const list = await db.collaborationContract.findMany({ where: { professionalId: actor.id }, orderBy: { createdAt: "desc" }, include: { owner: { select: { displayName: true, city: true } }, _count: { select: { products: true, orderItems: true } } } });
  return (
    <>
      <PageHeader title="Collaborations" subtitle="Les particuliers qui vous ont confié leurs ventes." />
      {!list.length ? <EmptyState title="Aucune collaboration" text="Rendez-vous dans la prospection pour trouver vos premiers clients." /> : (
        <div className="grid gap-3 md:grid-cols-2">{list.map((c) => (
          <Link key={c.id} href={`/collaborations/${c.id}`}><Card className="p-5 transition hover:shadow-md">
            <div className="flex items-center gap-3"><Avatar name={c.owner.displayName} /><div className="flex-1"><p className="font-medium">{c.owner.displayName}</p><p className="text-xs text-ink-3">{c.owner.city}</p></div><Badge tone={c.status === "ACTIVE" ? "success" : "neutral"}>{c.status === "ACTIVE" ? "Active" : "Terminée"}</Badge></div>
            <p className="mt-3 text-sm text-ink-2">{formatBps(c.commissionBps)} · {modeLabel[c.mode]}</p>
            <p className="text-sm text-ink-3">{c._count.products} article(s) confié(s) · {c._count.orderItems} vente(s) · jusqu&apos;au {formatDate(c.endsAt)}</p>
          </Card></Link>
        ))}</div>
      )}
    </>
  );
}
