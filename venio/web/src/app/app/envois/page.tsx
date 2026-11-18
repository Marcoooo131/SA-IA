"use client";
import { useEffect, useState } from "react";
import { useMe } from "@/components/AppShell";
import { Alert, Badge, Card, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { NOTIF_STATUS, TEMPLATE_LABELS, fmtDateTime } from "@/lib/format";

type N = { id: string; template_key: string; channel: string; to_address: string; status: string; provider: string | null; scheduled_for: string; sent_at: string | null; last_error: string | null };

export default function SentPage() {
  const me = useMe();
  const [rows, setRows] = useState<N[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<N[]>("/notifications").then(setRows).catch((e) => setError(errorMessage(e))); }, []);
  const testMode = rows?.some((r) => r.status === "logged");
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Historique des envois</h1>
      {testMode && <Alert kind="info">Mode test : les emails marqués « Non envoyé » ont été préparés mais pas expédiés. L&apos;envoi réel s&apos;active quand le serveur d&apos;emails est configuré.</Alert>}
      {error && <Alert>{error}</Alert>}
      {!rows ? <Spinner /> : rows.length === 0 ? <Card><p className="text-sm text-ink-muted">Aucun message pour l&apos;instant.</p></Card> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs text-ink-muted"><tr><th className="px-4 py-2">Message</th><th className="px-4 py-2">Destinataire</th><th className="px-4 py-2">Prévu le</th><th className="px-4 py-2">Statut</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">{TEMPLATE_LABELS[r.template_key] ?? r.template_key}</td>
                  <td className="px-4 py-2 text-ink-muted">{r.to_address}</td>
                  <td className="px-4 py-2 text-ink-muted first-letter:uppercase">{fmtDateTime(r.scheduled_for, me.tenant.timezone)}</td>
                  <td className="px-4 py-2"><Badge tone={r.status === "sent" ? "good" : r.status === "failed" ? "bad" : "neutral"}>{r.status === "logged" && r.provider === "demonstration" ? "Simulé (démonstration)" : NOTIF_STATUS[r.status] ?? r.status}</Badge>
                    {r.last_error && <span className="block text-xs text-danger">{r.last_error}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
