"use client";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useMe } from "@/components/AppShell";
import { AccountSettings } from "@/components/AccountSettings";
import { MissedCallSettings } from "@/components/MissedCallSettings";
import { Alert, Button, Card, Checkbox, Field, Input, Select, Spinner, Textarea, cx } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { MEETING_LABELS, fmtDateTime } from "@/lib/format";
import { DEMO } from "@/lib/routes";

const TABS = [["page", "Page publique"], ["horaires", "Horaires"], ["prestations", "Prestations"], ["absences", "Absences"], ["appels", "Appels manqués"], ["compte", "Mon compte"]] as const;
type Tab = (typeof TABS)[number][0];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("page");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("onglet");
    if (t && TABS.some(([k]) => k === t)) setTab(t as Tab);
  }, []);
  // Assistant de configuration : l'étape « horaires » est validée quand l'entreprise les a consultés.
  useEffect(() => { if (tab === "horaires" && !DEMO) api("/onboarding", { method: "POST", body: { seen: "horaires" } }).catch(() => {}); }, [tab]);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
      <div className="flex flex-wrap gap-2">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cx("rounded-full px-3 py-1.5 text-sm", tab === k ? "bg-ink text-white" : "bg-surface hover:bg-ink/5")}>{l}</button>)}
      </div>
      {tab === "page" && <ProfileTab />}
      {tab === "horaires" && <HoursTab />}
      {tab === "prestations" && <ServicesTab />}
      {tab === "absences" && <TimeOffTab />}
      {tab === "appels" && <MissedCallSettings />}
      {tab === "compte" && <AccountSettings />}
    </div>
  );
}

function useSaver() {
  const [state, setState] = useState<{ busy: boolean; error: string; ok: string }>({ busy: false, error: "", ok: "" });
  const run = async (fn: () => Promise<unknown>, ok = "Enregistré.") => {
    setState({ busy: true, error: "", ok: "" });
    try { await fn(); setState({ busy: false, error: "", ok }); } catch (e) { setState({ busy: false, error: errorMessage(e), ok: "" }); }
  };
  const feedback = <>{state.error && <Alert>{state.error}</Alert>}{state.ok && <Alert kind="success">{state.ok}</Alert>}</>;
  return { busy: state.busy, run, feedback };
}

type Profile = {
  name: string; slug: string; notification_email: string; timezone: string; holidays_country: string | null;
  branding: { primary_color: string; accent_color: string; logo_url: string | null };
  public_profile: { tagline: string; description: string; phone: string; email: string; address: string; service_area: string; opening_hours: string; reassurance: string[] };
  settings: { postal_prefixes: string[]; cancel_notice_min: number };
};

type RawProfile = Omit<Profile, "branding" | "public_profile" | "settings"> & {
  branding: Partial<Profile["branding"]>; public_profile: Partial<Profile["public_profile"]>; settings: Partial<Profile["settings"]>;
};

function ProfileTab() {
  const [p, setP] = useState<Profile | null>(null);
  const { busy, run, feedback } = useSaver();
  useEffect(() => {
    api<RawProfile>("/settings/profile").then((r) => setP({
      ...r,
      branding: { primary_color: "#14213D", accent_color: "#F28C28", logo_url: null, ...r.branding },
      public_profile: { tagline: "", description: "", phone: "", email: "", address: "", service_area: "", opening_hours: "", reassurance: [], ...r.public_profile },
      settings: { postal_prefixes: [], cancel_notice_min: 120, ...r.settings },
    }));
  }, []);
  if (!p) return <Spinner />;
  const pp = p.public_profile;
  const setPP = (k: keyof Profile["public_profile"]) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setP({ ...p, public_profile: { ...pp, [k]: e.target.value } });

  return (
    <form className="grid gap-5 lg:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => api("/settings/profile", { method: "PUT", body: p })); }}>
      <Card className="space-y-4">
        <h2 className="font-semibold">Entreprise</h2>
        <Field label="Nom affiché"><Input required value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
        <Field label="Accroche" hint="Une phrase sous votre nom, ex. « Salles de bain clés en main dans les Hauts-de-Seine »."><Input maxLength={120} value={pp.tagline} onChange={setPP("tagline")} /></Field>
        <Field label="Présentation"><Textarea maxLength={1500} value={pp.description} onChange={setPP("description")} /></Field>
        <Field label="Points forts" hint="Un par ligne (6 maximum), uniquement des engagements réels : « Devis gratuit », « Artisan RGE »…">
          <Textarea rows={3} value={pp.reassurance.join("\n")} onChange={(e) => setP({ ...p, public_profile: { ...pp, reassurance: e.target.value.split("\n").map((x) => x.slice(0, 60)).filter(Boolean).slice(0, 6) } })} />
        </Field>
      </Card>
      <Card className="space-y-4">
        <h2 className="font-semibold">Coordonnées et zone</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Téléphone"><Input value={pp.phone} onChange={setPP("phone")} /></Field>
          <Field label="Email public"><Input type="email" value={pp.email} onChange={setPP("email")} /></Field>
        </div>
        <Field label="Adresse"><Input value={pp.address} onChange={setPP("address")} /></Field>
        <Field label="Zone d'intervention (affichée)"><Input value={pp.service_area} onChange={setPP("service_area")} placeholder="Boulogne, Issy, Paris 15e…" /></Field>
        <Field label="Codes postaux acceptés pour les rendez-vous sur place" hint="Débuts de codes postaux séparés par des virgules (ex. 92, 75015). Vide = partout.">
          <Input value={p.settings.postal_prefixes.join(", ")} onChange={(e) => setP({ ...p, settings: { ...p.settings, postal_prefixes: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } })} />
        </Field>
        <Field label="Email qui reçoit les nouvelles demandes"><Input required type="email" value={p.notification_email} onChange={(e) => setP({ ...p, notification_email: e.target.value })} /></Field>
        <Field label="Délai minimum pour annuler ou déplacer en ligne (heures)">
          <Input type="number" min={0} max={168} value={p.settings.cancel_notice_min / 60} onChange={(e) => setP({ ...p, settings: { ...p.settings, cancel_notice_min: Math.round(Number(e.target.value) * 60) } })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Couleur principale"><Input type="color" className="h-11 p-1" value={p.branding.primary_color} onChange={(e) => setP({ ...p, branding: { ...p.branding, primary_color: e.target.value } })} /></Field>
          <Field label="Couleur d'accent"><Input type="color" className="h-11 p-1" value={p.branding.accent_color} onChange={(e) => setP({ ...p, branding: { ...p.branding, accent_color: e.target.value } })} /></Field>
        </div>
        <Checkbox checked={p.holidays_country === "FR"} onChange={(e) => setP({ ...p, holidays_country: e.target.checked ? "FR" : null })}
          label="Fermé les jours fériés (France)" />
      </Card>
      <div className="space-y-3 lg:col-span-2">{feedback}<Button type="submit" loading={busy}>Enregistrer</Button></div>
    </form>
  );
}

type Resource = { id: string; name: string; is_active: boolean; rules: { weekday: number; start_time: string; end_time: string }[] };
const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function HoursTab() {
  const [resources, setResources] = useState<Resource[] | null>(null);
  const { busy, run, feedback } = useSaver();
  const load = useCallback(() => api<Resource[]>("/settings/resources").then(setResources), []);
  useEffect(() => { load(); }, [load]);
  if (!resources) return <Spinner />;

  const update = (rid: string, rules: Resource["rules"]) => setResources(resources.map((r) => (r.id === rid ? { ...r, rules } : r)));

  return (
    <div className="space-y-5">
      {resources.map((r) => (
        <Card key={r.id} className="space-y-3">
          <h2 className="font-semibold">{r.name}</h2>
          {DAYS.map((label, i) => {
            const wd = i + 1;
            const dayRules = r.rules.filter((x) => x.weekday === wd);
            return (
              <div key={wd} className="grid items-start gap-2 border-t border-line pt-3 sm:grid-cols-[120px_1fr]">
                <span className="pt-2 text-sm font-medium">{label}</span>
                <div className="space-y-2">
                  {dayRules.length === 0 && <p className="pt-2 text-sm text-ink-muted">Fermé</p>}
                  {dayRules.map((rule, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <Input type="time" className="max-w-32" value={rule.start_time} onChange={(e) => update(r.id, r.rules.map((x) => (x === rule ? { ...x, start_time: e.target.value } : x)))} />
                      <span>–</span>
                      <Input type="time" className="max-w-32" value={rule.end_time} onChange={(e) => update(r.id, r.rules.map((x) => (x === rule ? { ...x, end_time: e.target.value } : x)))} />
                      <Button type="button" variant="ghost" onClick={() => update(r.id, r.rules.filter((x) => x !== rule))} aria-label="Supprimer la plage"><X aria-hidden className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <button className="text-sm underline" onClick={() => update(r.id, [...r.rules, { weekday: wd, start_time: "09:00", end_time: "12:00" }])}>+ Ajouter une plage</button>
                </div>
              </div>
            );
          })}
          <Button loading={busy} onClick={() => run(() => api(`/settings/resources/${r.id}/availability`, { method: "PUT", body: { rules: r.rules } }), "Horaires enregistrés.")}>Enregistrer les horaires</Button>
        </Card>
      ))}
      {feedback}
    </div>
  );
}

type Service = { id: string; key: string; name: string; description: string | null; meeting_type: string; duration_min: number; buffer_before_min: number;
  buffer_after_min: number; slot_interval_min: number; min_notice_min: number; max_horizon_days: number; price_display: string | null; is_active: boolean; resource_ids: string[] };

function ServicesTab() {
  const [services, setServices] = useState<Service[] | null>(null);
  const { busy, run, feedback } = useSaver();
  useEffect(() => { api<Service[]>("/settings/services").then(setServices); }, []);
  if (!services) return <Spinner />;
  const set = (id: string, patch: Partial<Service>) => setServices(services.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const num = (id: string, k: keyof Service, factor = 1) => (e: React.ChangeEvent<HTMLInputElement>) => set(id, { [k]: Math.round(Number(e.target.value) * factor) } as Partial<Service>);

  return (
    <div className="space-y-5">
      <Alert kind="info">Le parcours choisit automatiquement la prestation selon les réponses du client. Une prestation désactivée n&apos;est plus réservable.</Alert>
      {services.map((s) => (
        <Card key={s.id} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Input className="max-w-md font-semibold" value={s.name} onChange={(e) => set(s.id, { name: e.target.value })} />
            <Checkbox checked={s.is_active} onChange={(e) => set(s.id, { is_active: e.target.checked })} label="Active" />
          </div>
          <Field label="Description"><Input value={s.description ?? ""} onChange={(e) => set(s.id, { description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Type">
              <Select value={s.meeting_type} onChange={(e) => set(s.id, { meeting_type: e.target.value })}>
                {Object.entries(MEETING_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Durée (min)"><Input type="number" min={5} max={600} value={s.duration_min} onChange={num(s.id, "duration_min")} /></Field>
            <Field label="Battement après (min)" hint="Trajet, rangement…"><Input type="number" min={0} max={240} value={s.buffer_after_min} onChange={num(s.id, "buffer_after_min")} /></Field>
            <Field label="Intervalle des créneaux (min)"><Input type="number" min={5} max={240} value={s.slot_interval_min} onChange={num(s.id, "slot_interval_min")} /></Field>
            <Field label="Délai minimum (heures)"><Input type="number" min={0} value={s.min_notice_min / 60} onChange={num(s.id, "min_notice_min", 60)} /></Field>
            <Field label="Réservable jusqu'à (jours)"><Input type="number" min={1} max={365} value={s.max_horizon_days} onChange={num(s.id, "max_horizon_days")} /></Field>
            <Field label="Tarif affiché (facultatif)" hint="Ex. « Gratuit », « 49 € déductibles »."><Input value={s.price_display ?? ""} onChange={(e) => set(s.id, { price_display: e.target.value || null })} /></Field>
          </div>
          <Button loading={busy} onClick={() => run(() => api(`/settings/services/${s.id}`, { method: "PUT", body: s }), "Prestation enregistrée.")}>Enregistrer</Button>
        </Card>
      ))}
      {feedback}
    </div>
  );
}

type TimeOff = { id: string; resource_id: string | null; starts_at: string; ends_at: string; reason: string | null };

function TimeOffTab() {
  const me = useMe();
  const [rows, setRows] = useState<TimeOff[] | null>(null);
  const [form, setForm] = useState({ start: "", end: "", reason: "" });
  const { busy, run, feedback } = useSaver();
  const load = useCallback(() => api<TimeOff[]>("/settings/time-off").then(setRows), []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <h2 className="mb-3 font-semibold">Bloquer une période</h2>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await api("/settings/time-off", { method: "POST", body: { starts_at: new Date(form.start).toISOString(), ends_at: new Date(form.end).toISOString(), reason: form.reason || null } });
            setForm({ start: "", end: "", reason: "" });
            await load();
          }, "Période bloquée : aucun créneau ne sera proposé.");
        }}>
          <Field label="Début"><Input required type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
          <Field label="Fin"><Input required type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
          <Field label="Motif (interne)"><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Congés, chantier…" /></Field>
          {feedback}
          <Button type="submit" loading={busy}>Bloquer</Button>
        </form>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Périodes à venir</h2>
        {!rows ? <Spinner /> : rows.length === 0 ? <p className="text-sm text-ink-muted">Aucune.</p> : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span><span className="first-letter:uppercase">{fmtDateTime(r.starts_at, me.tenant.timezone)}</span> → {fmtDateTime(r.ends_at, me.tenant.timezone)}{r.reason && <span className="text-ink-muted"> · {r.reason}</span>}</span>
                <Button variant="ghost" onClick={() => run(async () => { await api(`/settings/time-off/${r.id}`, { method: "DELETE" }); await load(); }, "Période supprimée.")}>Supprimer</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
