import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/ui/Form";
import { deleteSearchAction } from "@/app/actions/shop";
import { formatDate } from "@/lib/format";

export default async function Alerts() {
  const actor = await requireActor();
  const list = await db.savedSearch.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHeader title="Alertes de recherche" subtitle="Vous êtes notifié (application et e-mail) dès qu'une annonce correspondante est publiée. Créez une alerte depuis la page de recherche." />
      {!list.length ? <EmptyState title="Aucune alerte" /> : <div className="space-y-2">{list.map((s) => {
        const qs = new URLSearchParams(Object.entries(s.filters as Record<string, unknown>).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString();
        return (
          <Card key={s.id} className="flex items-center justify-between p-4">
            <div><Link href={`/recherche?${qs}`} className="font-medium hover:underline">{s.label}</Link><p className="text-xs text-ink-3">Créée le {formatDate(s.createdAt)} · dernier envoi : {formatDate(s.lastNotifiedAt)}</p></div>
            <ActionButton action={deleteSearchAction} fields={{ id: s.id }} variant="ghost">Supprimer</ActionButton>
          </Card>);
      })}</div>}
    </>
  );
}
