"use client";
import { ArrowRight, CheckCircle2, ExternalLink, Phone, PhoneMissed, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, BrowserFrame, Button, PhoneFrame, SmsBubble, Spinner, ThreadProgress, buttonClass, cx } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { McCall } from "@/lib/missedCalls";

type Phase = "intro" | "ready" | "calling" | "sms" | "booking" | "booked";
type CaseRow = { id: string; first_name: string; last_name: string | null; service_name: string; created_at: string };

const STEPS = [
  "Un prospect appelle, vous ne décrochez pas",
  "Il reçoit un SMS",
  "Il ouvre le lien",
  "Il décrit son besoin",
  "Il choisit un créneau",
  "Il reçoit la confirmation",
  "La demande arrive dans votre espace",
];
const stepOf: Record<Phase, number> = { intro: 0, ready: 0, calling: 1, sms: 2, booking: 3, booked: 7 };

/** Numéro de la plage réservée par l'ARCEP aux œuvres de fiction (06 39 98 xx xx) : il n'appartient à personne. */
const fictitiousNumber = () => `06 39 98 ${String(Math.floor(Math.random() * 100)).padStart(2, "0")} ${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`;

export function InteractiveDemo() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warnLogout, setWarnLogout] = useState(false);
  const [call, setCall] = useState<McCall | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [number, setNumber] = useState("");
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Un vrai compte est-il connecté dans ce navigateur ? La démonstration ouvrirait une autre session.
    api<{ tenant: { is_demo?: boolean } }>("/auth/me").then((m) => { if (!m.tenant.is_demo) setWarnLogout(true); }).catch(() => {});
    return () => { if (poll.current) clearInterval(poll.current); };
  }, []);

  const refresh = useCallback(async () => {
    const [calls, cs] = await Promise.all([api<McCall[]>("/missed-calls/calls"), api<CaseRow[]>("/case-files")]);
    setCall(calls[0] ?? null);
    setCases(cs);
    return calls[0] ?? null;
  }, []);

  const start = async () => {
    setBusy(true); setError("");
    try { await api("/demo/start", { method: "POST" }); setPhase("ready"); setCall(null); setCases([]); }
    catch (e) { setError(errorMessage(e)); }
    setBusy(false);
  };

  const simulate = async () => {
    setBusy(true); setError("");
    const n = fictitiousNumber();
    setNumber(n); setPhase("calling");
    try {
      await Promise.all([
        api("/missed-calls/simulate", { method: "POST", body: { from_number: n } }),
        new Promise((r) => setTimeout(r, 3200)),   // sonnerie, puis délai de validation (raccourci, et dit comme tel)
      ]);
      const c = await refresh();
      if (c?.decision === "sent") setPhase("sms");
      else setError(c?.reason_label ? `Aucun SMS : ${c.reason_label}.` : "Le SMS n'a pas été déclenché. Relancez la démonstration.");
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? "La session de démonstration a expiré. Relancez-la." : errorMessage(e));
      setPhase("ready");
    }
    setBusy(false);
  };

  const openLink = () => {
    setPhase("booking");
    if (poll.current) clearInterval(poll.current);
    poll.current = setInterval(async () => {
      try {
        const c = await refresh();
        if (c?.booked_at) { setPhase("booked"); if (poll.current) clearInterval(poll.current); }
      } catch { /* nouvelle tentative au prochain passage */ }
    }, 3000);
  };

  const code = call?.sms_body?.match(/\/c\/([A-Za-z0-9]+)/)?.[1];
  const step = phase === "booking" ? (call?.form_started_at ? 4 : 3) : stepOf[phase];

  if (phase === "intro") {
    return (
      <div className="rounded-frame border border-line bg-surface p-8 md:p-10">
        <h2 className="font-display text-3xl font-semibold text-ink">Comment se déroule la démonstration</h2>
        <ol className="mt-6 grid gap-x-8 gap-y-3 md:grid-cols-2">
          {STEPS.map((s, i) => <li key={s} className="flex gap-3"><span className="tabular grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white">{i + 1}</span><span className="text-ink">{s}</span></li>)}
        </ol>
        <p className="mt-6 text-sm text-ink-muted">Vous jouez le prospect sur le téléphone, et vous voyez en direct ce que reçoit l&apos;entreprise. Une entreprise fictive est créée pour vous, puis supprimée automatiquement sous 2 heures. Aucun SMS ni email n&apos;est envoyé.</p>
        {warnLogout && <div className="mt-6"><Alert kind="warning">Vous êtes connecté à votre espace dans ce navigateur : la démonstration vous en déconnectera. Ouvrez-la plutôt dans une fenêtre de navigation privée si vous voulez rester connecté.</Alert></div>}
        {error && <div className="mt-6"><Alert>{error}</Alert></div>}
        <Button size="lg" className="mt-8" loading={busy} onClick={start} icon={<ArrowRight aria-hidden className="h-4 w-4" />}>Lancer la démonstration</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-frame border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-medium text-ink">Étape {Math.max(1, Math.min(step, 7))} sur 7 · <span className="text-ink-muted">{STEPS[Math.max(0, Math.min(step, 7) - 1)]}</span></p>
          <Button variant="ghost" size="sm" onClick={start} icon={<RotateCcw aria-hidden className="h-4 w-4" />}>Recommencer</Button>
        </div>
        <div className="mt-4"><ThreadProgress value={(Math.min(step, 7) / 7) * 100} label="Progression de la démonstration" /></div>
      </div>
      {error && <Alert>{error}</Alert>}

      <div className="grid items-start gap-8 lg:grid-cols-[320px_1fr]">
        <div>
          <p className="mb-3 text-center text-sm font-medium text-ink-muted">Téléphone du prospect</p>
          <PhoneFrame label="Téléphone du prospect (démonstration)">
            {phase === "ready" && (
              <div className="flex h-full flex-col items-center justify-center gap-4 px-6 pb-16 text-center">
                <Phone aria-hidden className="h-10 w-10 text-ink-subtle" strokeWidth={1.5} />
                <p className="text-sm text-ink-muted">Le prospect s&apos;apprête à appeler « Rénovation Exemple ».</p>
              </div>
            )}
            {phase === "calling" && (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 pb-16 text-center">
                <PhoneMissed aria-hidden className="h-10 w-10 text-signal-strong" strokeWidth={1.5} />
                <p className="font-medium text-ink">Appel vers Rénovation Exemple…</p>
                <p className="text-sm text-ink-muted">Pas de réponse. Venio valide que l&apos;appel n&apos;a pas été pris (délai raccourci pour la démonstration).</p>
                <Spinner />
              </div>
            )}
            {phase === "sms" && call?.sms_body && (
              <div className="space-y-4 px-4">
                <p className="flex items-center justify-center gap-1.5 text-xs text-ink-subtle"><PhoneMissed aria-hidden className="h-3 w-3" />Appel manqué</p>
                <SmsBubble sender="RENOEXEMPLE" time="à l'instant">{call.sms_body}</SmsBubble>
                <Button className="w-full" onClick={openLink} disabled={!code}>Ouvrir le lien</Button>
                <p className="text-center text-[11px] text-ink-subtle">SMS simulé : rien n&apos;a été envoyé.</p>
              </div>
            )}
            {(phase === "booking" || phase === "booked") && code && (
              <iframe title="Page de réservation de l'entreprise de démonstration" src={`/c/${code}`} className="-mt-9 h-[calc(100%+2.25rem)] w-full border-0 bg-paper" />
            )}
          </PhoneFrame>
          {phase === "booking" && <p className="mt-3 text-center text-sm text-ink-muted">Répondez aux questions et choisissez un créneau dans le téléphone.</p>}
        </div>

        <div>
          <p className="mb-3 text-sm font-medium text-ink-muted">Espace de l&apos;entreprise (démonstration)</p>
          <BrowserFrame url="venio — appels manqués">
            <div className="space-y-4 p-5">
              {phase === "ready" && <Button onClick={simulate} loading={busy} icon={<PhoneMissed aria-hidden className="h-4 w-4" />}>1. Simuler un appel manqué</Button>}
              {!call ? <p className="text-sm text-ink-muted">Aucun appel pour l&apos;instant.</p> : (
                <div className="rounded-card border border-line p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-ink">Appel du {call.number_masked}</p>
                    <Badge tone="warning">Manqué</Badge>
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {([
                      [call.decision === "sent", "SMS déclenché (simulé)"],
                      [!!call.clicked_at, "Lien ouvert"],
                      [!!call.form_started_at, "Parcours commencé"],
                      [!!call.booked_at, "Rendez-vous réservé"],
                    ] as [boolean, string][]).map(([ok, l]) => (
                      <li key={l} className={cx("flex items-center gap-2", ok ? "font-medium text-success" : "text-ink-subtle")}>
                        {ok ? <CheckCircle2 aria-hidden className="h-4 w-4" /> : <span aria-hidden className="h-4 w-4 rounded-full border border-line-strong" />}{l}
                        <span className="sr-only">{ok ? " : fait" : " : en attente"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {cases.length > 0 && (
                <div className={cx("rounded-card border p-4", phase === "booked" ? "border-success/40 bg-success-soft/40" : "border-line")}>
                  <p className="text-sm font-semibold text-ink">Nouvelle demande</p>
                  <p className="mt-1 text-ink">{cases[0].first_name} {cases[0].last_name ?? ""} · <span className="text-ink-muted">{cases[0].service_name}</span></p>
                  <p className="mt-1 text-xs text-ink-muted">Rattachée à l&apos;appel manqué : rendez-vous récupéré.</p>
                </div>
              )}
              {phase === "booked" && (
                <Alert kind="success" title="Parcours complet">
                  Le prospect a reçu sa confirmation (email simulé, non envoyé) et la demande est dans l&apos;espace, avec ses réponses et son créneau.
                </Alert>
              )}
            </div>
          </BrowserFrame>
          {phase === "booked" && (
            <div className="mt-5 flex flex-wrap gap-3">
              <a href="/app/appels" target="_blank" rel="noreferrer" className={buttonClass("primary")}>Explorer l&apos;espace de démonstration<ExternalLink aria-hidden className="h-4 w-4" /></a>
              <a href="/inscription" className={buttonClass("secondary")}>Créer mon espace réel</a>
            </div>
          )}
          {number && <p className="mt-4 text-xs text-ink-subtle">Numéro utilisé : {number}, de la plage réservée par l&apos;ARCEP aux œuvres de fiction.</p>}
        </div>
      </div>
    </div>
  );
}
