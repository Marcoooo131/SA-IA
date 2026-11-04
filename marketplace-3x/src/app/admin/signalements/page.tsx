import Link from "next/link";
import { db } from "@/server/db";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/ui/Form";
import { reportDecisionAction } from "@/app/actions/admin";
import { formatDateTime } from "@/lib/format";

export default async function Reports() {
  const reports = await db.report.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100, include: { reporter: { select: { displayName: true } } } });
  const href = (t: string, id: string) => t === "PRODUCT" ? `/produit/${id}` : t === "USER" ? `/admin/utilisateurs/${id}` : `/messages/${id}`;
  return (
    <>
      <PageHeader title="Signalements" subtitle="Mécanisme de notification et d'action (DSA art. 16) : chaque signalement reçoit une décision motivée." />
      {!reports.length ? <EmptyState title="Aucun signalement" /> : <div className="space-y-2">{reports.map((r) => (
        <Card key={r.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
          <div className="min-w-0 flex-1"><p className="font-medium">{r.reason} <Badge>{r.targetType}</Badge> <Badge tone={r.status === "OPEN" ? "warning" : "neutral"}>{r.status}</Badge></p>
            <p className="text-ink-3">Par {r.reporter?.displayName ?? "visiteur anonyme"} · {formatDateTime(r.createdAt)} · <Link href={href(r.targetType, r.targetId)} className="underline">voir l&apos;élément</Link></p>
            {r.details && <p className="mt-1 text-ink-2">{r.details}</p>}{r.decision && <p className="mt-1 text-ink-3">Décision : {r.decision}</p>}</div>
          {r.status === "OPEN" && <div className="flex flex-wrap gap-2">
            {r.targetType === "PRODUCT" && <ActionButton action={reportDecisionAction} fields={{ reportId: r.id, action: "remove_product", decision: `Annonce retirée : ${r.reason}` }} variant="danger">Retirer l&apos;annonce</ActionButton>}
            <ActionButton action={reportDecisionAction} fields={{ reportId: r.id, action: "suspend_user", decision: `Compte suspendu : ${r.reason}` }} variant="danger" confirm="Suspendre le compte concerné ?">Suspendre l&apos;auteur</ActionButton>
            <ActionButton action={reportDecisionAction} fields={{ reportId: r.id, action: "dismiss", decision: "Aucune infraction constatée" }}>Classer</ActionButton>
          </div>}
        </Card>))}</div>}
    </>
  );
}
