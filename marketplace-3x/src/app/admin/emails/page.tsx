import { db } from "@/server/db";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export default async function Emails() {
  const mails = await db.emailOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeader title="E-mails transactionnels" subtitle={process.env.SMTP_URL ? "Envoyés via SMTP." : "Aucun SMTP configuré : les e-mails sont conservés ici (développement)."} />
      <div className="space-y-2">{mails.map((m) => (
        <Card key={m.id} className="p-4 text-sm"><details><summary className="flex cursor-pointer flex-wrap items-center gap-2"><Badge tone={m.status === "SENT" ? "success" : m.status === "FAILED" ? "danger" : "neutral"}>{m.status}</Badge><strong>{m.subject}</strong><span className="text-ink-3">→ {m.to} · {formatDateTime(m.createdAt)}</span></summary>
          <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-canvas p-3 text-xs">{m.text}</pre></details></Card>
      ))}</div>
    </>
  );
}
