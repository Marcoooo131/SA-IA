"use client";
import { Pause, Play, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Badge, Button, Card, CardHeader, Checkbox, Field, IconButton, Input, PhoneFrame, Select, SmsBubble, Spinner, Switch, Textarea, cx, useToast,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { WEEKDAYS, type McConfig, type McExclusion, type McLine, type McSettings, type SmsPreview } from "@/lib/missedCalls";
import { DEMO } from "@/lib/routes";

const hhmm = (t: string) => t.slice(0, 5);

export function MissedCallSettings() {
  const toast = useToast();
  const [s, setS] = useState<McSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [cfg, setCfg] = useState<McConfig | null>(null);
  const [preview, setPreview] = useState<SmsPreview | null>(null);
  const [lines, setLines] = useState<McLine[]>([]);
  const [excl, setExcl] = useState<McExclusion[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [st, l, e] = await Promise.all([api<McSettings>("/missed-calls/settings"), api<McLine[]>("/missed-calls/lines"), api<McExclusion[]>("/missed-calls/exclusions")]);
    setS(st); setEnabled(st.enabled); setCfg({ ...st.config, send_start: hhmm(st.config.send_start), send_end: hhmm(st.config.send_end) });
    setPreview(st.preview); setLines(l); setExcl(e);
  }, []);
  useEffect(() => { if (!DEMO) load().catch((e) => setError(errorMessage(e))); }, [load]);

  // Aperçu calculé par le serveur (même calcul de segments que l'envoi réel).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!cfg) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api<SmsPreview>("/missed-calls/preview", { method: "POST", body: { tone: cfg.tone, custom_text: cfg.custom_text, stop_mention: cfg.stop_mention } })
        .then(setPreview).catch(() => {});
    }, 300);
  }, [cfg?.tone, cfg?.custom_text, cfg?.stop_mention]); // eslint-disable-line react-hooks/exhaustive-deps

  if (DEMO) return <Alert kind="info">La démonstration hors ligne ne couvre pas encore les appels manqués (prévu à l&apos;étape 6 de la feuille de route).</Alert>;
  if (error) return <Alert>{error}</Alert>;
  if (!s || !cfg) return <Spinner label="Chargement…" />;

  const set = (patch: Partial<McConfig>) => setCfg({ ...cfg, ...patch });
  const save = async () => {
    setBusy(true); setError("");
    try {
      await api("/missed-calls/settings", { method: "PUT", body: { enabled, config: cfg } });
      toast("Réglages enregistrés"); await load();
    } catch (e) { toast(errorMessage(e), "error"); }
    setBusy(false);
  };
  const tooLong = preview && preview.segments > s.max_segments;

  return (
    <div className="space-y-5">
      <Alert kind="info" title="Aucun SMS ne part pour l'instant">
        Les lignes de test sont simulées et les envois payants sont {s.paid_sending_enabled ? "autorisés sur le serveur" : "désactivés"}.
        Avant les envois réels : choix du fournisseur de téléphonie, nom d&apos;expéditeur enregistré chez Brevo, et validation juridique du message (mention STOP).
      </Alert>

      <Card>
        <Switch checked={enabled} onChange={setEnabled} label="Récupération des appels manqués"
          description="Quand un appel n'est pas pris, un SMS invite l'appelant à décrire son besoin et à réserver." />
      </Card>

      <Lines lines={lines} reload={load} />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
        <Card>
          <CardHeader title="Message envoyé" description="Court, identifié, utile : il répond à l'appel du prospect." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ton du message">
              <Select value={cfg.tone} onChange={(e) => set({ tone: e.target.value, custom_text: e.target.value === "personnalise" ? (cfg.custom_text ?? s.templates[0].text) : cfg.custom_text })}>
                {s.templates.map((t) => <option key={t.tone} value={t.tone}>{t.label}</option>)}
                <option value="personnalise">Personnalisé</option>
              </Select>
            </Field>
            <Field label="Nom d'expéditeur" optional hint="11 caractères, lettres et chiffres (ex. RENOEXEMPLE). À enregistrer chez Brevo.">
              <Input maxLength={11} value={cfg.sender ?? ""} onChange={(e) => set({ sender: e.target.value.replace(/[^A-Za-z0-9]/g, "") || null })} />
            </Field>
          </div>
          {cfg.tone === "personnalise" && (
            <Field className="mt-4" label="Texte personnalisé" hint="Variables : {entreprise}, {lien} (obligatoire), {stop}.">
              <Textarea maxLength={480} value={cfg.custom_text ?? ""} onChange={(e) => set({ custom_text: e.target.value })} />
            </Field>
          )}
          <Field className="mt-4" label="Mention d'opposition" optional hint="Ex. « STOP au 36xxx » : à définir avec Brevo et votre avocat avant les envois réels.">
            <Input maxLength={40} value={cfg.stop_mention ?? ""} onChange={(e) => set({ stop_mention: e.target.value || null })} />
          </Field>
          {preview && (
            <p className={cx("mt-4 text-sm", tooLong ? "text-danger" : "text-ink-muted")}>
              <strong className="tabular">{preview.segments} SMS facturé{preview.segments > 1 ? "s" : ""}</strong> par envoi · {preview.length} caractères · {preview.encoding === "GSM-7" ? "alphabet standard" : "alphabet étendu (70 caractères par SMS)"}
              {preview.costly_chars.length > 0 && <> · caractères coûteux : <span className="font-mono">{preview.costly_chars.join(" ")}</span></>}
              {tooLong && ` — maximum ${s.max_segments}.`}
            </p>
          )}
        </Card>
        <PhoneFrame label="Aperçu du SMS" className="hidden lg:block">
          <div className="space-y-4 px-4">
            <SmsBubble sender={cfg.sender || "EXPEDITEUR"}>{preview?.text ?? "…"}</SmsBubble>
            <p className="text-center text-[11px] text-ink-subtle">Aperçu · lien d&apos;exemple</p>
          </div>
        </PhoneFrame>
      </div>

      <Card>
        <CardHeader title="Quand envoyer" description="Entre 8 h et 21 h 30 au plus, jamais la nuit." />
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Jours d&apos;envoi</legend>
            <div className="flex flex-wrap gap-3">
              {WEEKDAYS.map(([d, l]) => (
                <Checkbox key={d} label={l} checked={cfg.send_days.includes(d)}
                  onChange={(e) => set({ send_days: e.target.checked ? [...cfg.send_days, d].sort() : cfg.send_days.filter((x) => x !== d) })} />
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="De"><Input type="time" min="08:00" max="21:30" value={cfg.send_start} onChange={(e) => set({ send_start: e.target.value })} /></Field>
            <Field label="À"><Input type="time" min="08:00" max="21:30" value={cfg.send_end} onChange={(e) => set({ send_end: e.target.value })} /></Field>
            <Field label="Hors horaires">
              <Select value={cfg.out_of_hours} onChange={(e) => set({ out_of_hours: e.target.value as McConfig["out_of_hours"] })}>
                <option value="defer">Envoyer à la réouverture</option>
                <option value="skip">Ne pas envoyer</option>
              </Select>
            </Field>
            <Field label="Si l'appel a moins de (h)"><Input type="number" min={1} max={48} value={cfg.max_defer_hours} disabled={cfg.out_of_hours === "skip"} onChange={(e) => set({ max_defer_hours: Number(e.target.value) })} /></Field>
          </div>
          <Checkbox label="Pas d'envoi les jours fériés" checked={cfg.skip_holidays} onChange={(e) => set({ skip_holidays: e.target.checked })} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Règles anti-sollicitation" description="Pour ne jamais harceler un appelant ni envoyer de SMS inutile." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Délai de validation (s)" hint="Évite un SMS pendant un transfert ou une longue sonnerie."><Input type="number" min={30} max={600} value={cfg.validation_delay_s} onChange={(e) => set({ validation_delay_s: Number(e.target.value) })} /></Field>
          <Field label="Un seul SMS par numéro sur (h)" hint="Appels rapprochés regroupés."><Input type="number" min={1} max={168} value={cfg.burst_window_hours} onChange={(e) => set({ burst_window_hours: Number(e.target.value) })} /></Field>
          <Field label="SMS maximum par numéro (30 j)"><Input type="number" min={1} max={10} value={cfg.max_per_number_30d} onChange={(e) => set({ max_per_number_30d: Number(e.target.value) })} /></Field>
          <Field label="Pas de SMS si demande récente (jours)"><Input type="number" min={0} max={30} value={cfg.recent_request_days} onChange={(e) => set({ recent_request_days: Number(e.target.value) })} /></Field>
          <Field label="Sonnerie minimale (s)" hint="En dessous, l'appel est ignoré (robots, erreurs). Sans effet avec un renvoi sur non-réponse."><Input type="number" min={0} max={20} value={cfg.min_ring_seconds ?? 4} onChange={(e) => set({ min_ring_seconds: Number(e.target.value) })} /></Field>
          <Field label="Clients déjà connus" hint="Numéro déjà enregistré dans vos demandes.">
            <Select value={cfg.known_contacts ?? "skip"} onChange={(e) => set({ known_contacts: e.target.value as "skip" | "send" })}>
              <option value="skip">Pas de SMS : je les rappelle moi-même</option>
              <option value="send">Envoyer le SMS quand même</option>
            </Select>
          </Field>
        </div>
        <p className="mt-4 text-sm text-ink-muted">Toujours exclus : numéros masqués, fixes et étrangers, numéros de démarchage (préfixes réservés par l&apos;ARCEP), numéros de l&apos;entreprise, oppositions (STOP), clients ayant un rendez-vous à venir, appels rappelés et décrochés entre-temps.</p>
      </Card>

      <Exclusions items={excl} reload={load} />

      <Card>
        <CardHeader title="Consommation du mois" />
        <p className="tabular text-sm"><strong className="text-lg">{s.credits.used}</strong> / {s.credits.limit ?? "∞"} crédits SMS utilisés</p>
        <p className="mt-1 text-xs text-ink-muted">1 crédit = 1 SMS facturé (segment). Les SMS simulés ou non partis ne consomment rien. À 100 %, les appels restent enregistrés mais plus aucun SMS ne part.</p>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} loading={busy} disabled={!!tooLong || cfg.send_days.length === 0}>Enregistrer les réglages</Button>
        <Link href="/app/appels" className="text-sm text-ink-muted underline">Voir l&apos;historique des appels</Link>
      </div>
    </div>
  );
}

function Lines({ lines, reload }: { lines: McLine[]; reload: () => Promise<void> }) {
  const toast = useToast();
  const [label, setLabel] = useState("Ligne de test");
  const [num, setNum] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try { await api("/missed-calls/lines", { method: "POST", body: { label, business_number: num || null } }); toast("Ligne de test ajoutée"); await reload(); }
    catch (e) { toast(errorMessage(e), "error"); }
    setBusy(false);
  };
  const toggle = async (l: McLine) => {
    try { await api(`/missed-calls/lines/${l.id}`, { method: "PATCH", body: { status: l.status === "active" ? "paused" : "active" } }); await reload(); }
    catch (e) { toast(errorMessage(e), "error"); }
  };
  return (
    <Card>
      <CardHeader title="Lignes suivies" description="Les lignes réelles (renvoi d'appel depuis votre numéro) arriveront avec le choix du fournisseur de téléphonie. En attendant, une ligne de test permet d'essayer tout le module." />
      {lines.length > 0 && (
        <ul className="mb-4 divide-y divide-line rounded-card border border-line">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium">{l.label} {l.is_test && <Badge tone="info">Test</Badge>} {l.status === "paused" && <Badge tone="warning">En pause</Badge>}</p>
                <p className="text-sm text-ink-muted">{l.business_number ? `Votre numéro : ${l.business_number}` : "Numéro de l'entreprise non renseigné"}</p>
              </div>
              <IconButton label={l.status === "active" ? "Mettre en pause" : "Réactiver"} onClick={() => toggle(l)}>
                {l.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {lines.length === 0 && (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Nom de la ligne"><Input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
          <Field label="Votre numéro" optional hint="Exclu des envois (évite les boucles)."><Input type="tel" value={num} onChange={(e) => setNum(e.target.value)} placeholder="01 23 45 67 89" /></Field>
          <Button onClick={add} loading={busy} icon={<Plus aria-hidden className="h-4 w-4" />}>Ajouter une ligne de test</Button>
        </div>
      )}
    </Card>
  );
}

function Exclusions({ items, reload }: { items: McExclusion[]; reload: () => Promise<void> }) {
  const toast = useToast();
  const [num, setNum] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"excluded" | "opt_out">("excluded");
  const add = async () => {
    try { await api("/missed-calls/exclusions", { method: "POST", body: { number: num, label: label || null, kind } }); setNum(""); setLabel(""); await reload(); }
    catch (e) { toast(errorMessage(e), "error"); }
  };
  const del = async (n: string) => {
    try { await api(`/missed-calls/exclusions/${encodeURIComponent(n)}`, { method: "DELETE" }); await reload(); }
    catch (e) { toast(errorMessage(e), "error"); }
  };
  return (
    <Card>
      <CardHeader title="Numéros exclus et oppositions" description="Collaborateurs, fournisseurs, numéros personnels, ou personnes ayant demandé à ne plus recevoir de SMS." />
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_200px_auto] sm:items-end">
        <Field label="Numéro"><Input type="tel" value={num} onChange={(e) => setNum(e.target.value)} placeholder="06 12 34 56 78" /></Field>
        <Field label="Note" optional><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. fournisseur" /></Field>
        <Field label="Type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as "excluded" | "opt_out")}>
            <option value="excluded">Exclu</option><option value="opt_out">Opposition (STOP)</option>
          </Select>
        </Field>
        <Button variant="secondary" onClick={add} disabled={!num.trim()}>Ajouter</Button>
      </div>
      {items.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-card border border-line">
          {items.map((x) => (
            <li key={x.number} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span><span className="tabular font-medium">{x.display}</span> <Badge tone={x.kind === "opt_out" ? "warning" : "neutral"}>{x.kind === "opt_out" ? "Opposition" : "Exclu"}</Badge> {x.label && <span className="text-ink-muted">· {x.label}</span>}</span>
              <IconButton label={`Retirer ${x.display}`} onClick={() => del(x.number)}><Trash2 className="h-4 w-4" /></IconButton>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
