import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { listConversations } from "@/server/services/messaging";
import { Avatar, Container, EmptyState, PageHeader } from "@/components/ui";
import { roleLabel } from "@/lib/labels";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Messagerie" };
export default async function Inbox() {
  const actor = await requireActor("/messages");
  const convs = await listConversations(actor.id);
  return (
    <Container className="max-w-3xl py-10">
      <PageHeader title="Messagerie" subtitle="Acheteurs, vendeurs, indépendants et fournisseurs : tous vos échanges au même endroit." />
      {!convs.length ? <EmptyState title="Aucune conversation" /> : (
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius)] border border-line bg-white">
          {convs.map((c) => (
            <li key={c.id}><Link href={`/messages/${c.id}`} className="flex items-center gap-3 p-4 hover:bg-canvas">
              <Avatar name={c.others[0]?.displayName ?? "?"} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2"><p className={`truncate ${c.unread ? "font-semibold" : "font-medium"}`}>{c.others.map((o) => o.displayName).join(", ")} <span className="text-xs font-normal text-ink-3">· {c.others[0] && roleLabel[c.others[0].primaryRole]}</span></p><span className="shrink-0 text-xs text-ink-3">{timeAgo(c.lastMessageAt)}</span></div>
                <p className="truncate text-sm text-ink-3">{c.subject} — {c.messages[0]?.body || "📎 Pièce jointe"}</p>
              </div>
              {c.unread && <span className="h-2.5 w-2.5 rounded-full bg-brand" aria-label="Non lu" />}
            </Link></li>
          ))}
        </ul>
      )}
    </Container>
  );
}
