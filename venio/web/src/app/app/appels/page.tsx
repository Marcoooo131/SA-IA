"use client";
import { Check, CheckCheck, Circle, Phone, PhoneMissed, RefreshCw, Settings, ShieldOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMe } from "@/components/AppShell";
import {
  Alert, Badge, Button, Card, EmptyState, Field, Input, Kpi, Modal, Select, Skeleton, Table, Td, Th, buttonClass, useToast,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { fmtDateTime, pct } from "@/lib/format";
import { OUTCOME_LABELS, smsState, type McCall, type McLine, type McStats } from "@/lib/missedCalls";
import { DEMO, caseFilePath } from "@/lib/routes";

export default function MissedCallsPage() {
  const me = useMe();
  const toast = useToast();
  const [calls, setCalls] = useState<McCall[] | null>(null);
  const [stats, setStats] = useState<McStats | null>(null);
  const [lines, setLines] = useState<McLine[]>([]);
  const [error, setError] = useState("");
  const [simOpen, setSimOpen] = useState(false);
  const [detail, setDetail] = useState<McCall | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, s, l] = await Promise.all([
        api<McCall[]>("/missed-calls/calls"), api<McStats>("/missed-calls/stats"), api<McLine[]>("/missed-calls/lines")]);
      setCalls(c); setStats(s); setLines(l); setError("");
    } catch (e) { setError(errorMessage(e)); }
  }, []);

  useEffect(() => {
    if (!DEMO) load();
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [load]);

  /** Après une simulation, le traitement (validation puis décision) prend quelques secondes : on rafraîchit. */
  const watch = () => {
    if (poll.current) clearInterval(poll.current);
    let n = 0;
    poll.current = setInterval(() => { load(); if (++n >= 8 && poll.current) clearInterval(poll.current); }, 4000);
  };

  if (DEMO) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight">Appels manqués</h1>
        <Alert kind="info">La démonstration hors ligne ne couvre pas encore la récupération des appels manqués : elle sera ajoutée avec la démonstration interactive (étape 6). Elle est disponible dans la version en ligne.</Alert>
      </div>
    );
  }

  const hasTestLine = lines.some((l) => l.is_test);
  const tz = me.tenant.timezone;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Appels manqués</h1>
          <p className="mt-1 text-sm text-ink-muted">Chaque appel sans réponse peut devenir une demande de rendez-vous.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={load} icon={<RefreshCw aria-hidden className="h-4 w-4" />}>Actualiser</Button>
          <Link href="/app/parametres?onglet=appels" className={buttonClass("secondary")}><Settings aria-hidden className="h-4 w-4" />Réglages</Link>
          <Button onClick={() => setSimOpen(true)} disabled={!hasTestLine} icon={<PhoneMissed aria-hidden className="h-4 w-4" />}>Simuler un appel manqué</Button>
        </div>
      </div>

      <Alert kind="info" title="Mode test">
        Aucun SMS n&apos;est envoyé pour l&apos;instant : les appels de la ligne de test sont simulés, et les envois payants sont
        désactivés tant que vous ne les avez pas autorisés. Le traitement est réel : règles, décisions, liens suivis et statistiques.
      </Alert>
      {error && <Alert>{error}</Alert>}
      {calls !== null && !hasTestLine && (
        <Alert kind="warning">Aucune ligne n&apos;est configurée. <Link href="/app/parametres?onglet=appels">Ajoutez une ligne de test</Link> pour essayer le module.</Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stats ? <>
          <Card><Kpi label="Appels manqués" value={stats.missed} hint={`sur ${stats.days} jours`} /></Card>
          <Card><Kpi label="SMS déclenchés" value={stats.triggered} hint={`${stats.sent} réellement envoyé(s)`} /></Card>
          <Card><Kpi label="Liens ouverts" value={stats.clicked} /></Card>
          <Card><Kpi label="Rendez-vous récupérés" value={stats.booked} hint={`${stats.started} parcours commencé(s)`} /></Card>
          <Card><Kpi label="Taux de récupération" value={pct(stats.recovery_rate)} hint={stats.reliable ? "rendez-vous / appels manqués" : "Indicatif : moins de 20 appels manqués"} /></Card>
        </> : Array.from({ length: 5 }, (_, i) => <Card key={i} className="space-y-3"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-8 w-1/3" /></Card>)}
      </div>

      {stats && stats.not_sent_reasons.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Pourquoi certains SMS ne sont pas partis</h2>
          <ul className="flex flex-wrap gap-2">
            {stats.not_sent_reasons.map((r) => <li key={r.reason}><Badge>{r.label} · {r.count}</Badge></li>)}
          </ul>
        </Card>
      )}

      {calls === null ? <Card className="space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" /></Card>
        : calls.length === 0 ? (
          <EmptyState icon={<PhoneMissed className="h-6 w-6" />} title="Aucun appel pour l'instant"
            action={hasTestLine ? <Button variant="secondary" onClick={() => setSimOpen(true)}>Simuler un appel manqué</Button> : undefined}>
            Les appels de vos lignes suivies apparaîtront ici, avec le SMS envoyé et le rendez-vous obtenu.
          </EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>Date</Th><Th>Numéro</Th><Th>Appel</Th><Th>SMS</Th><Th>Suivi</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {calls.map((c) => {
                const s = smsState(c);
                return (
                  <tr key={c.call_id} className={c.handled_at ? "opacity-60" : undefined}>
                    <Td><span className="whitespace-nowrap first-letter:uppercase">{fmtDateTime(c.started_at, tz)}</span>{c.is_test && <span className="block text-xs text-ink-subtle">Ligne de test</span>}</Td>
                    <Td className="whitespace-nowrap font-medium">{c.number_masked}</Td>
                    <Td><Badge tone={c.outcome === "answered" || c.outcome === "transferred" ? "good" : c.outcome === "pending" ? "info" : "warning"}>{OUTCOME_LABELS[c.outcome]}</Badge></Td>
                    <Td>
                      <Badge tone={s.tone}>{s.label}</Badge>
                      {c.decision === "not_sent" && c.reason_label && <span className="mt-1 block text-xs text-ink-muted">{c.reason_label}</span>}
                    </Td>
                    <Td className="text-sm">
                      <Funnel c={c} />
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        {c.number_tel && <a href={`tel:${c.number_tel}`} className={buttonClass("ghost", "sm")} aria-label={`Rappeler le ${c.number_display}`}><Phone aria-hidden className="h-4 w-4" />Rappeler</a>}
                        <Button variant="ghost" size="sm" onClick={() => setDetail(c)}>Détail</Button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

      <SimulateModal open={simOpen} onClose={() => setSimOpen(false)} onDone={() => { setSimOpen(false); toast("Appel simulé : décision dans quelques secondes"); load(); watch(); }} />
      <DetailModal call={detail} tz={tz} onClose={() => setDetail(null)} onChanged={() => { setDetail(null); load(); }} />
    </div>
  );
}

function Funnel({ c, inline }: { c: McCall; inline?: boolean }) {
  if (c.decision !== "sent") return <span className="text-ink-subtle">—</span>;
  const steps: [boolean, string][] = [[!!c.clicked_at, "Lien ouvert"], [!!c.form_started_at, "Parcours commencé"], [!!c.booked_at, "Rendez-vous"]];
  return (
    <ul className={inline ? "flex flex-wrap gap-x-4 gap-y-1 text-sm" : "space-y-0.5 text-xs"}>
      {steps.map(([ok, label]) => (
        <li key={label} className={`flex items-center gap-1.5 whitespace-nowrap ${ok ? "font-medium text-success" : "text-ink-subtle"}`}>
          {ok ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Circle aria-hidden className="h-3 w-3" />}
          {label}<span className="sr-only">{ok ? " : oui" : " : pas encore"}</span>
        </li>
      ))}
    </ul>
  );
}

function SimulateModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [num, setNum] = useState("06 12 34 56 78");
  const [scenario, setScenario] = useState("missed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    setBusy(true); setError("");
    try { await api("/missed-calls/simulate", { method: "POST", body: { from_number: num, scenario } }); onDone(); }
    catch (e) { setError(errorMessage(e)); }
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose} title="Simuler un appel"
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button loading={busy} onClick={go}>Simuler l&apos;appel</Button></>}>
      <div className="space-y-4">
        <p className="text-ink-muted">L&apos;appel passe par la vraie chaîne de traitement (règles, décision, lien suivi) sur votre ligne de test. Aucun SMS n&apos;est envoyé ; le délai de validation est raccourci à 3 secondes.</p>
        <Field label="Scénario">
          <Select value={scenario} onChange={(e) => setScenario(e.target.value)}>
            <option value="missed">Appel sans réponse</option>
            <option value="abandoned">L&apos;appelant raccroche avant la fin</option>
            <option value="answered">Appel décroché (aucun SMS attendu)</option>
            <option value="masked">Numéro masqué (aucun SMS possible)</option>
          </Select>
        </Field>
        {scenario !== "masked" && <Field label="Numéro de l'appelant" hint="Utilisez votre propre numéro ou un numéro fictif : rien n'est envoyé."><Input value={num} onChange={(e) => setNum(e.target.value)} type="tel" /></Field>}
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}

function DetailModal({ call, tz, onClose, onChanged }: { call: McCall | null; tz: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const act = async (k: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(k);
    try { await fn(); toast(ok); onChanged(); } catch (e) { toast(errorMessage(e), "error"); }
    setBusy("");
  };
  const c = call;
  return (
    <Modal open={!!c} onClose={onClose} title={c ? `Appel du ${c.number_display}` : ""} size="lg"
      footer={c && <>
        {c.number_tel && <Button variant="ghost" loading={busy === "ex"} icon={<ShieldOff aria-hidden className="h-4 w-4" />}
          onClick={() => act("ex", () => api("/missed-calls/exclusions", { method: "POST", body: { number: c.number_tel, label: "Exclu depuis l'historique" } }), "Numéro exclu des SMS")}>Exclure ce numéro</Button>}
        {c.recovery_id && !c.handled_at && <Button variant="secondary" loading={busy === "h"} icon={<CheckCheck aria-hidden className="h-4 w-4" />}
          onClick={() => act("h", () => api(`/missed-calls/recoveries/${c.recovery_id}/handled`, { method: "POST" }), "Marqué comme traité")}>Marquer comme traité</Button>}
        {c.number_tel && <a href={`tel:${c.number_tel}`} className={buttonClass("primary")}><Phone aria-hidden className="h-4 w-4" />Rappeler</a>}
      </>}>
      {c && (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[160px_1fr]">
          <dt className="text-ink-muted">Date</dt><dd className="first-letter:uppercase">{fmtDateTime(c.started_at, tz)} · {c.line_label}</dd>
          <dt className="text-ink-muted">Appel</dt><dd>{OUTCOME_LABELS[c.outcome]}</dd>
          <dt className="text-ink-muted">SMS</dt>
          <dd>
            <Badge tone={smsState(c).tone}>{smsState(c).label}</Badge>
            {c.reason_label && c.decision === "not_sent" && <p className="mt-1 text-ink-muted">{c.reason_label}</p>}
            {c.sms_error && <p className="mt-1 text-danger">{c.sms_error}</p>}
          </dd>
          {c.sms_body && <><dt className="text-ink-muted">Message</dt><dd><p className="rounded-card bg-sunken px-3 py-2">{c.sms_body}</p>{c.credits ? <p className="mt-1 text-xs text-ink-subtle">{c.credits} crédit(s) SMS réservé(s){c.sms_status === "logged" ? ", rendu(s) car rien n'est parti" : ""}</p> : null}</dd></>}
          {c.decision === "sent" && <><dt className="text-ink-muted">Suivi</dt><dd><Funnel c={c} inline />{c.click_count ? <p className="mt-1 text-xs text-ink-subtle">Lien ouvert {c.click_count} fois (un aperçu automatique du lien peut compter comme une ouverture).</p> : null}</dd></>}
          {c.case_file_id && <><dt className="text-ink-muted">Demande</dt><dd><Link className="font-medium text-signal-strong underline" href={caseFilePath(c.case_file_id)}>Ouvrir le dossier</Link></dd></>}
          {c.handled_at && <><dt className="text-ink-muted">Traité</dt><dd className="first-letter:uppercase">{fmtDateTime(c.handled_at, tz)}</dd></>}
        </dl>
      )}
    </Modal>
  );
}
