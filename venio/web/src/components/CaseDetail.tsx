"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useMe } from "@/components/AppShell";
import { Alert, Badge, Button, Card, Spinner, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { fileUrl } from "@/lib/routes";
import { BOOKING_STATUS, CASE_STATUS, MEETING_LABELS, NOTIF_STATUS, TEMPLATE_LABELS, fmtDateTime } from "@/lib/format";

type Detail = {
  case: { id: string; status: string; summary: string; completeness: number; created_at: string; service_name: string; meeting_type: string; source: Record<string, string>;
    answers: { step: string; question: string; display: string; type: string; value: unknown }[] };
  contact: { first_name: string; last_name: string | null; email: string; phone: string | null; address: { line: string; postal_code: string; city: string } | null };
  bookings: { id: string; starts_at: string; status: string; resource_name: string }[];
  notes: { id: string; body: string; created_at: string; author: string | null }[];
  files: { id: string; original_name: string; mime_type: string }[];
  history: { created_at: string; actor: string; action: string }[];
  notifications: { template_key: string; to_address: string; status: string; scheduled_for: string; provider: string | null; last_error: string | null }[];
  consents: { channel: string; purpose: string; granted: boolean }[];
};

const ACTIONS: Record<string, string> = { confirmed: "Rendez-vous confirmé", rescheduled: "Rendez-vous déplacé", cancelled: "Rendez-vous annulé", completed: "Rendez-vous terminé", no_show: "Client absent" };

export function CaseDetail({ id }: { id: string }) {
  const me = useMe();
  const tz = me.tenant.timezone;
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => api<Detail>(`/case-files/${id}`).then(setD).catch((e) => setError(errorMessage(e))), [id]);
  useEffect(() => { load(); }, [load]);

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label); setError("");
    try { await fn(); await load(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(""); }
  }

  if (!d) return error ? <Alert>{error}</Alert> : <Spinner />;
  const c = d.contact;
  const next = d.bookings.find((b) => b.status === "confirmed");

  return (
    <div className="space-y-5">
      <Link href="/app/dossiers" className="text-sm text-ink-soft hover:underline">← Demandes</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{c.first_name} {c.last_name}</h1>
          <p className="text-ink-soft">{d.case.service_name} · {MEETING_LABELS[d.case.meeting_type]} · dossier complet à {d.case.completeness} %</p>
        </div>
        <select value={d.case.status} disabled={!!busy} aria-label="Statut du dossier"
          onChange={(e) => act("status", () => api(`/case-files/${id}`, { method: "PATCH", body: { status: e.target.value } }))}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm">
          {Object.entries(CASE_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {error && <Alert>{error}</Alert>}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <h2 className="mb-1 font-semibold">Résumé</h2>
            <p className="text-sm">{d.case.summary || "—"}</p>
            <h3 className="mt-4 text-sm font-semibold">Réponses détaillées</h3>
            <dl className="mt-1 divide-y divide-line">
              {d.case.answers.map((a) => (
                <div key={a.step} className="grid gap-1 py-2 sm:grid-cols-[1fr_1fr]">
                  <dt className="text-sm text-ink-soft">{a.question}</dt><dd className="whitespace-pre-line text-sm">{a.display}</dd>
                </div>
              ))}
            </dl>
          </Card>
          {d.files.length > 0 && (
            <Card>
              <h2 className="mb-3 font-semibold">Photos et documents</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {d.files.map((f) => (
                  <a key={f.id} href={fileUrl(f.id)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-line">
                    {f.mime_type.startsWith("image/")
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={fileUrl(f.id)} alt={f.original_name} className="aspect-square w-full object-cover" />
                      : <div className="grid aspect-square place-items-center bg-ink/5 text-sm">📄 {f.original_name}</div>}
                  </a>
                ))}
              </div>
            </Card>
          )}
          <Card>
            <h2 className="mb-3 font-semibold">Notes internes</h2>
            <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) act("note", async () => { await api(`/case-files/${id}/notes`, { method: "POST", body: { body: note } }); setNote(""); }); }}>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visible uniquement par votre équipe" rows={3} />
              <Button type="submit" variant="secondary" className="mt-2" loading={busy === "note"} disabled={!note.trim()}>Ajouter la note</Button>
            </form>
            <ul className="mt-4 space-y-3">
              {d.notes.map((n) => <li key={n.id} className="rounded-lg bg-paper p-3 text-sm"><p className="whitespace-pre-line">{n.body}</p><p className="mt-1 text-xs text-ink-soft">{n.author} · {fmtDateTime(n.created_at, tz)}</p></li>)}
            </ul>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <h2 className="mb-2 font-semibold">Contact</h2>
            <ul className="space-y-1 text-sm">
              <li><a className="underline" href={`mailto:${c.email}`}>{c.email}</a></li>
              {c.phone && <li><a className="underline" href={`tel:${c.phone}`}>{c.phone}</a></li>}
              {c.address && <li>{c.address.line}, {c.address.postal_code} {c.address.city} · <a className="underline" target="_blank" href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${c.address.line} ${c.address.postal_code} ${c.address.city}`)}`}>Carte</a></li>}
            </ul>
            <p className="mt-2 text-xs text-ink-soft">Rappels SMS : {d.consents.find((x) => x.channel === "sms")?.granted ? "acceptés" : "non acceptés"}</p>
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Rendez-vous</h2>
            <ul className="space-y-2">
              {d.bookings.map((b) => (
                <li key={b.id} className="text-sm">
                  <p className="font-medium first-letter:uppercase">{fmtDateTime(b.starts_at, tz)}</p>
                  <p className="text-ink-soft">{b.resource_name} · <Badge tone={b.status === "confirmed" ? "good" : b.status === "cancelled" ? "bad" : "neutral"}>{BOOKING_STATUS[b.status]}</Badge></p>
                </li>
              ))}
            </ul>
            {next && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="secondary" loading={busy === "completed"} onClick={() => act("completed", () => api(`/bookings/${next.id}`, { method: "PATCH", body: { status: "completed" } }))}>Terminé</Button>
                <Button variant="secondary" loading={busy === "no_show"} onClick={() => act("no_show", () => api(`/bookings/${next.id}`, { method: "PATCH", body: { status: "no_show" } }))}>Absent</Button>
                <Button variant="danger" className="col-span-2" loading={busy === "cancel"} onClick={() => {
                  if (confirm("Annuler ce rendez-vous ? Le client sera prévenu par email.")) act("cancel", () => api(`/bookings/${next.id}`, { method: "PATCH", body: { status: "cancelled" } }));
                }}>Annuler le rendez-vous</Button>
              </div>
            )}
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Historique</h2>
            <ul className="space-y-1.5 text-xs">
              <li>{fmtDateTime(d.case.created_at, tz)} — Demande reçue{d.case.source?.utm_source && ` (via ${d.case.source.utm_source})`}</li>
              {d.history.map((h, i) => <li key={i}>{fmtDateTime(h.created_at, tz)} — {ACTIONS[h.action] ?? h.action}{h.actor === "client" ? " par le client" : ""}</li>)}
            </ul>
            <h3 className="mb-1 mt-4 text-sm font-semibold">Messages</h3>
            <ul className="space-y-1.5 text-xs">
              {d.notifications.map((n, i) => (
                <li key={i}>{TEMPLATE_LABELS[n.template_key] ?? n.template_key} — {NOTIF_STATUS[n.status] ?? n.status}
                  <span className="text-ink-soft"> · {fmtDateTime(n.scheduled_for, tz)}</span>{n.last_error && <span className="text-red-700"> · {n.last_error}</span>}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
