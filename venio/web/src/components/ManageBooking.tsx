"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Spinner, buttonClass } from "@/components/ui";
import { SlotPicker, type SlotsResponse } from "@/components/SlotPicker";
import { api, errorMessage } from "@/lib/api";
import { publicPagePath, withBase } from "@/lib/routes";
import { BOOKING_STATUS, MEETING_LABELS, fmtDateTime } from "@/lib/format";

type View = {
  booking: { id: string; starts_at: string; status: string; service_name: string; meeting_type: string; duration_min: number; first_name: string | null };
  tenant: { name: string; slug: string; timezone: string; phone: string | null };
  can_modify: boolean;
};

export function ManageBooking({ slug, token }: { slug: string; token: string }) {
  const base = `/public/${slug}/manage/${token}`;
  const [view, setView] = useState<View | null>(null);
  const [mode, setMode] = useState<"view" | "move" | "cancel">("view");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { api<View>(base).then(setView).catch((e) => setError(errorMessage(e))); }, [base]);
  const load = useCallback((from: string, days: number) => api<SlotsResponse>(`${base}/slots?from=${from}&days=${days}`), [base]);

  async function move(start: string) {
    setBusy(start); setError("");
    try {
      setView(await api<View>(`${base}/reschedule`, { method: "POST", body: { start } }));
      setMode("view"); setInfo("Votre rendez-vous a été déplacé. Une confirmation vous est envoyée par email.");
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  }
  async function cancel() {
    setBusy("cancel"); setError("");
    try {
      setView(await api<View>(`${base}/cancel`, { method: "POST" }));
      setMode("view"); setInfo("Votre rendez-vous est annulé.");
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  }

  if (!view) return <main className="mx-auto max-w-lg px-5 py-16">{error ? <Alert>{error}</Alert> : <div className="flex justify-center"><Spinner /></div>}</main>;
  const b = view.booking;
  return (
    <main className="mx-auto max-w-lg space-y-5 px-5 py-10">
      <p className="text-sm text-ink-muted">{view.tenant.name}</p>
      <h1 className="text-2xl font-semibold tracking-tight">{b.first_name ? `Bonjour ${b.first_name}, voici` : "Voici"} votre rendez-vous</h1>
      {info && <Alert kind="success">{info}</Alert>}
      {error && <Alert>{error}</Alert>}
      <section className="rounded-card border border-line bg-surface p-5">
        <p className="text-lg font-medium first-letter:uppercase">{fmtDateTime(b.starts_at, view.tenant.timezone)}</p>
        <p className="text-ink-muted">{b.service_name} · {b.duration_min} min · {MEETING_LABELS[b.meeting_type]}</p>
        <p className="mt-2 text-sm">Statut : <strong>{BOOKING_STATUS[b.status] ?? b.status}</strong></p>
      </section>
      {mode === "view" && view.can_modify && (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setMode("move")}>Déplacer</Button>
          <Button variant="danger" onClick={() => setMode("cancel")}>Annuler</Button>
        </div>
      )}
      {mode === "view" && !view.can_modify && b.status === "confirmed" && (
        <Alert kind="info">Le rendez-vous est trop proche pour être modifié en ligne.{view.tenant.phone && <> Appelez le <a className="underline" href={`tel:${view.tenant.phone}`}>{view.tenant.phone}</a>.</>}</Alert>
      )}
      {mode === "view" && b.status === "cancelled" && (
        <a className={buttonClass("primary", "lg", "w-full")} href={withBase(publicPagePath(view.tenant.slug))}>Reprendre rendez-vous</a>
      )}
      {mode === "move" && (
        <section className="space-y-3">
          <h2 className="font-semibold">Choisissez un nouveau créneau</h2>
          <SlotPicker load={load} onPick={move} busyStart={busy} />
          <Button variant="ghost" onClick={() => setMode("view")}>Retour</Button>
        </section>
      )}
      {mode === "cancel" && (
        <section className="space-y-3 rounded-card border border-danger/20 bg-danger-soft p-4">
          <p>Confirmez-vous l&apos;annulation de ce rendez-vous ?</p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setMode("view")}>Non, le garder</Button>
            <Button variant="danger" loading={busy === "cancel"} onClick={cancel}>Oui, annuler</Button>
          </div>
        </section>
      )}
    </main>
  );
}
