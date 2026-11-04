import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { Button, Container, EmptyState, PageHeader } from "@/components/ui";
import { markAllReadAction } from "@/app/actions/account";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Notifications" };
export default async function Notifications() {
  const actor = await requireActor("/notifications");
  const list = await db.notification.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <Container className="max-w-3xl py-10">
      <PageHeader title="Notifications" action={<form action={markAllReadAction}><Button variant="secondary" size="sm">Tout marquer comme lu</Button></form>} />
      {!list.length ? <EmptyState title="Aucune notification" /> : (
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius)] border border-line bg-white">
          {list.map((n) => {
            const body = (<div className="flex gap-3 p-4"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand"}`} /><div className="flex-1"><p className={n.readAt ? "" : "font-semibold"}>{n.title}</p><p className="text-sm text-ink-2">{n.body}</p><p className="text-xs text-ink-3">{timeAgo(n.createdAt)}</p></div></div>);
            return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-canvas">{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </Container>
  );
}
