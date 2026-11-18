"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Field, Input, Spinner, Textarea, cx } from "@/components/ui";
import { SlotPicker, type SlotsResponse } from "@/components/SlotPicker";
import { ApiError, api, errorMessage } from "@/lib/api";
import { MEETING_LABELS, fmtDateTime } from "@/lib/format";
import { DEMO } from "@/lib/routes";
import { type Answers, type FlowDefinition, type FlowState, type Step, displayValue } from "@/lib/flow";

type Hold = { id: string; starts_at: string; ends_at: string; hold_expires_at: string } | null;
type Service = { key: string; name: string; meeting_type: string; duration_min: number };
type Phase = "questions" | "slots" | "details" | "recap" | "done";
type Contact = {
  first_name: string; last_name: string; email: string; phone: string;
  address: { line: string; postal_code: string; city: string };
  consent_sms_reminders: boolean; accept_privacy: boolean;
};
type Done = { booking: { starts_at: string; ends_at: string; service_name: string; meeting_type: string }; manage_url: string };

const emptyContact: Contact = {
  first_name: "", last_name: "", email: "", phone: "", address: { line: "", postal_code: "", city: "" },
  consent_sms_reminders: false, accept_privacy: false,
};

export function BookingFlow({ slug, tenantName, timezone, services, intro }: {
  slug: string; tenantName: string; timezone: string; services: Service[]; intro?: string;
}) {
  const storageKey = `venio:${slug}`;
  const [session, setSession] = useState<{ id: string; token: string } | null>(null);
  const [definition, setDefinition] = useState<FlowDefinition | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [state, setState] = useState<FlowState | null>(null);
  const [hold, setHold] = useState<Hold>(null);
  const [files, setFiles] = useState<{ id: string; original_name: string }[]>([]);
  const [phase, setPhase] = useState<Phase>("questions");
  const [viewStep, setViewStep] = useState<string | null>(null);
  const [contact, setContact] = useState<Contact>(emptyContact);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [resumed, setResumed] = useState(false);
  const [pickingStart, setPickingStart] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const headers = useMemo(() => (session ? { "X-Resume-Token": session.token } : undefined), [session]);
  const base = session ? `/public/${slug}/sessions/${session.id}` : "";
  const service = services.find((s) => s.key === state?.service_key) ?? null;

  const applyServer = useCallback((d: { answers: Answers; state: FlowState; hold?: Hold; definition?: FlowDefinition }) => {
    if (d.definition) setDefinition(d.definition);
    setAnswers(d.answers);
    setState(d.state);
    if (d.hold !== undefined) setHold(d.hold);
  }, []);

  const start = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const source: Record<string, string> = { device: window.matchMedia("(max-width: 640px)").matches ? "mobile" : "desktop" };
    for (const k of ["utm_source", "utm_medium", "utm_campaign"]) if (params.get(k)) source[k] = params.get(k)!;
    if (document.referrer) source.referrer = document.referrer.slice(0, 200);
    const d = await api<{ session_id: string; resume_token: string; definition: FlowDefinition; state: FlowState; answers: Answers }>(
      `/public/${slug}/sessions`, { method: "POST", body: { source } });
    localStorage.setItem(storageKey, JSON.stringify({ id: d.session_id, token: d.resume_token }));
    setSession({ id: d.session_id, token: d.resume_token });
    applyServer({ ...d, hold: null });
    setFiles([]);
    setPhase("questions");
    setViewStep(null);
  }, [slug, storageKey, applyServer]);

  // Démarrage : reprise automatique d'une demande en cours sur cet appareil.
  useEffect(() => {
    (async () => {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const s = JSON.parse(saved) as { id: string; token: string };
          try {
            const d = await api<{ status: string; definition: FlowDefinition; answers: Answers; state: FlowState; hold: Hold; files: { id: string; original_name: string }[] }>(
              `/public/${slug}/sessions/${s.id}`, { headers: { "X-Resume-Token": s.token } });
            if (d.status === "in_progress") {
              setSession(s);
              applyServer(d);
              setFiles(d.files);
              setResumed(Object.keys(d.answers).length > 0);
              setPhase(d.state.qualification_done ? (d.hold ? "details" : "slots") : "questions");
              return;
            }
          } catch { /* demande expirée ou introuvable : on recommence */ }
          localStorage.removeItem(storageKey);
        }
        await start();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBooting(false);
      }
    })();
  }, [slug, storageKey, start, applyServer]);

  const shownStepId = viewStep ?? state?.current_step ?? null;
  const shownStep = definition?.steps.find((s) => s.id === shownStepId) ?? null;

  const firstRender = useRef(true);
  useEffect(() => {
    // Pas de défilement au chargement : l'en-tête de l'entreprise doit rester visible.
    if (firstRender.current) firstRender.current = false;
    else topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    if (phase === "questions" && shownStepId && session) {
      api(`/public/${slug}/events`, { method: "POST", body: { session_id: session.id, type: "step_view", step: shownStepId }, headers })
        .catch(() => undefined);
    }
  }, [phase, shownStepId, session, slug, headers]);

  async function answer(step: Step, value: unknown) {
    setBusy(true);
    setError("");
    try {
      const d = await api<{ answers: Answers; state: FlowState; hold: Hold }>(`${base}/answers`, { method: "PUT", body: { step: step.id, value }, headers });
      applyServer(d);
      setViewStep(null);
      if (d.state.qualification_done) setPhase(d.hold ? "recap" : "slots");
    } catch (e) {
      if (e instanceof ApiError && e.status === 410) { await start(); return; }
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function back() {
    setError("");
    if (phase === "recap") return setPhase("details");
    if (phase === "details") return setPhase("slots");
    if (phase === "slots") {
      const last = state?.visited[state.visited.length - 1];
      setViewStep(last ?? null);
      return setPhase("questions");
    }
    if (!state) return;
    const idx = state.visited.indexOf(shownStepId ?? "");
    const prev = idx === -1 ? state.visited[state.visited.length - 1] : state.visited[idx - 1];
    if (prev) setViewStep(prev);
  }

  const loadSlots = useCallback((from: string, days: number) =>
    api<SlotsResponse>(`${base}/slots?from=${from}&days=${days}`, { headers }), [base, headers]);

  async function pick(startIso: string) {
    setPickingStart(startIso);
    setError("");
    try {
      const d = await api<{ hold: Hold }>(`${base}/hold`, { method: "POST", body: { start: startIso }, headers });
      setHold(d.hold);
      setPhase("details");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPickingStart(null);
    }
  }

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const needsAddress = service?.meeting_type === "on_site";
      const d = await api<Done>(`${base}/confirm`, {
        method: "POST", headers,
        body: { ...contact, address: needsAddress ? contact.address : null, preferred_channel: "email" },
      });
      setDone(d);
      setPhase("done");
      localStorage.removeItem(storageKey);
    } catch (e) {
      if (e instanceof ApiError && (e.code === "hold_expired" || e.code === "slot_taken")) {
        setHold(null);
        setPhase("slots");
      } else if (e instanceof ApiError && e.status === 422) {
        setPhase("details");
      }
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (booting) return <div className="flex justify-center py-16 text-ink-soft"><Spinner /></div>;
  if (!definition || !state) return <Alert>{error || "Le parcours de réservation est indisponible."}</Alert>;

  const progress = phase === "questions" ? Math.min(state.progress, 95) * 0.7
    : phase === "slots" ? 75 : phase === "details" ? 85 : phase === "recap" ? 95 : 100;

  return (
    <div ref={topRef} className="scroll-mt-4">
      {phase !== "done" && (
        <div className="mb-6 flex items-center gap-3">
          <button onClick={back} disabled={phase === "questions" && (state.visited.length === 0 || shownStepId === state.visited[0])}
            className="grid h-9 w-9 place-items-center rounded-full border border-line bg-white disabled:invisible" aria-label="Retour">←</button>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-[var(--brand-accent)] transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <span className="whitespace-nowrap text-right text-xs text-ink-soft">
            {phase === "questions" ? `${Math.min((viewStep ? state.visited.indexOf(viewStep) : state.answered) + 1, state.estimated_total)} / ~${state.estimated_total}` :
              phase === "slots" ? "Créneau" : phase === "details" ? "Coordonnées" : "Vérification"}
          </span>
        </div>
      )}

      {resumed && phase === "questions" && !viewStep && (
        <div className="mb-4"><Alert kind="info">
          Nous avons retrouvé votre demande en cours. <button className="underline" onClick={() => { setResumed(false); localStorage.removeItem(storageKey); start(); }}>Recommencer</button>
        </Alert></div>
      )}
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {phase === "questions" && shownStep && (
        <div key={shownStep.id} className="fade-in">
          {state.visited.length === 0 && !viewStep && intro && <p className="mb-3 text-ink-soft">{intro}</p>}
          <StepView step={shownStep} value={answers[shownStep.id]} busy={busy} onAnswer={(v) => answer(shownStep, v)}
            uploadUrl={`${base}/files`} headers={headers} files={files} onFilesChange={setFiles} />
        </div>
      )}

      {phase === "slots" && (
        <div className="fade-in space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">Choisissez votre rendez-vous</h2>
          {service && <p className="text-ink-soft">{service.name} · {service.duration_min} min · {MEETING_LABELS[service.meeting_type]}</p>}
          <SlotPicker load={loadSlots} onPick={pick} busyStart={pickingStart} selected={hold?.starts_at ?? null} />
          <p className="text-xs text-ink-soft">Seuls les créneaux réellement disponibles sont affichés.</p>
        </div>
      )}

      {phase === "details" && hold && (
        <ContactForm contact={contact} setContact={setContact} meetingType={service?.meeting_type ?? ""} tenantName={tenantName}
          hold={hold} timezone={timezone} onNext={() => { setError(""); setPhase("recap"); }} />
      )}

      {phase === "recap" && hold && (
        <div className="fade-in space-y-5">
          <h2 className="text-2xl font-semibold tracking-tight">Vérifiez votre demande</h2>
          <RecapBlock title="Rendez-vous" onEdit={() => setPhase("slots")}>
            <p className="font-medium first-letter:uppercase">{fmtDateTime(hold.starts_at, timezone)}</p>
            {service && <p className="text-sm text-ink-soft">{service.name} · {service.duration_min} min · {MEETING_LABELS[service.meeting_type]}</p>}
          </RecapBlock>
          <RecapBlock title="Votre projet">
            <dl className="divide-y divide-line">
              {state.visited.map((id) => {
                const st = definition.steps.find((s) => s.id === id)!;
                return (
                  <div key={id} className="flex items-start justify-between gap-3 py-2">
                    <div><dt className="text-xs text-ink-soft">{st.title}</dt><dd className="text-sm">{displayValue(st, answers[id])}</dd></div>
                    <button className="text-xs underline" onClick={() => { setViewStep(id); setPhase("questions"); }}>Modifier</button>
                  </div>
                );
              })}
            </dl>
          </RecapBlock>
          <RecapBlock title="Vos coordonnées" onEdit={() => setPhase("details")}>
            <p className="text-sm">{contact.first_name} {contact.last_name}</p>
            <p className="text-sm text-ink-soft">{contact.email}{contact.phone && ` · ${contact.phone}`}</p>
            {service?.meeting_type === "on_site" && <p className="text-sm text-ink-soft">{contact.address.line}, {contact.address.postal_code} {contact.address.city}</p>}
          </RecapBlock>
          <Button onClick={confirm} loading={busy} className="w-full bg-[var(--brand)] py-3.5 text-base">Confirmer le rendez-vous</Button>
        </div>
      )}

      {phase === "done" && done && <Success done={done} tenantName={tenantName} timezone={timezone} />}
    </div>
  );
}

function RecapBlock({ title, onEdit, children }: { title: string; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {onEdit && <button className="text-xs underline" onClick={onEdit}>Modifier</button>}
      </div>
      {children}
    </section>
  );
}

function StepView({ step, value, busy, onAnswer, uploadUrl, headers, files, onFilesChange }: {
  step: Step; value: unknown; busy: boolean; onAnswer: (v: unknown) => void;
  uploadUrl: string; headers?: Record<string, string>;
  files: { id: string; original_name: string }[]; onFilesChange: (f: { id: string; original_name: string }[]) => void;
}) {
  const [draft, setDraft] = useState<unknown>(value ?? (step.type === "multi_choice" || step.type === "photos" ? [] : step.type === "slider" ? Math.round(((step.min ?? 0) + (step.max ?? 100)) / 2) : ""));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const skip = !step.required && (
    <button className="mt-3 w-full py-2 text-sm text-ink-soft underline" disabled={busy} onClick={() => onAnswer(null)}>Passer cette question</button>
  );
  const next = (v: unknown, enabled = true) => (
    <Button className="mt-5 w-full bg-[var(--brand)] py-3 text-base" loading={busy} disabled={!enabled} onClick={() => onAnswer(v)}>Continuer</Button>
  );

  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight">{step.title}</h2>
      {step.help && <p className="mt-1 text-ink-soft">{step.help}</p>}
      <div className="mt-5">
        {step.type === "single_choice" && (
          <div className="grid grid-cols-2 gap-3">
            {step.options.map((o) => (
              <button key={o.value} disabled={busy} onClick={() => onAnswer(o.value)}
                className={cx("flex min-h-24 flex-col items-start justify-between rounded-xl border bg-white p-3 text-left transition hover:border-[var(--brand)]",
                  value === o.value ? "border-[var(--brand)] ring-1 ring-[var(--brand)]" : "border-line")}>
                {o.icon && <span className="text-2xl">{o.icon}</span>}
                <span className="font-medium leading-snug">{o.label}</span>
                {o.description && <span className="text-xs text-ink-soft">{o.description}</span>}
              </button>
            ))}
          </div>
        )}
        {step.type === "multi_choice" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {step.options.map((o) => {
                const sel = (draft as string[]).includes(o.value);
                return (
                  <button key={o.value} aria-pressed={sel} onClick={() => setDraft(sel ? (draft as string[]).filter((v) => v !== o.value) : [...(draft as string[]), o.value])}
                    className={cx("flex min-h-20 items-start gap-2 rounded-xl border bg-white p-3 text-left transition",
                      sel ? "border-[var(--brand)] ring-1 ring-[var(--brand)]" : "border-line hover:border-ink/40")}>
                    <span className={cx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border text-xs", sel ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-line")}>{sel && "✓"}</span>
                    <span>{o.icon && <span className="mr-1">{o.icon}</span>}<span className="font-medium">{o.label}</span></span>
                  </button>
                );
              })}
            </div>
            {next(draft, (draft as string[]).length > 0)}
          </>
        )}
        {step.type === "yes_no" && (
          <div className="grid grid-cols-2 gap-3">
            {[true, false].map((v) => (
              <button key={String(v)} disabled={busy} onClick={() => onAnswer(v)}
                className={cx("rounded-xl border bg-white py-5 text-lg font-medium transition hover:border-[var(--brand)]", value === v ? "border-[var(--brand)] ring-1 ring-[var(--brand)]" : "border-line")}>
                {v ? "Oui" : "Non"}
              </button>
            ))}
          </div>
        )}
        {(step.type === "text" || step.type === "long_text") && (
          <form onSubmit={(e) => { e.preventDefault(); onAnswer(draft); }}>
            {step.type === "text"
              ? <Input autoFocus value={draft as string} placeholder={step.placeholder} maxLength={200} onChange={(e) => setDraft(e.target.value)} />
              : <Textarea autoFocus value={draft as string} placeholder={step.placeholder} maxLength={2000} rows={4} onChange={(e) => setDraft(e.target.value)} />}
            <Button type="submit" className="mt-5 w-full bg-[var(--brand)] py-3 text-base" loading={busy} disabled={step.required && !(draft as string).trim()}>Continuer</Button>
          </form>
        )}
        {step.type === "number" && (
          <form onSubmit={(e) => { e.preventDefault(); onAnswer(draft === "" ? null : Number(draft)); }}>
            <div className="flex items-center gap-3">
              <Input autoFocus type="number" inputMode="decimal" min={step.min} max={step.max} step={step.step ?? "any"} value={draft as string}
                onChange={(e) => setDraft(e.target.value)} className="max-w-40 text-lg" />
              {step.unit && <span className="text-ink-soft">{step.unit}</span>}
            </div>
            <Button type="submit" className="mt-5 w-full bg-[var(--brand)] py-3 text-base" loading={busy} disabled={step.required && draft === ""}>Continuer</Button>
          </form>
        )}
        {step.type === "slider" && (
          <div>
            <p className="text-center text-4xl font-semibold">{String(draft)} <span className="text-lg font-normal text-ink-soft">{step.unit}</span></p>
            <input type="range" className="mt-4 w-full accent-[var(--brand)]" min={step.min} max={step.max} step={step.step ?? 1}
              value={Number(draft)} onChange={(e) => setDraft(Number(e.target.value))} aria-label={step.title} />
            <div className="flex justify-between text-xs text-ink-soft"><span>{step.min} {step.unit}</span><span>{step.max} {step.unit}</span></div>
            {next(draft)}
          </div>
        )}
        {step.type === "date" && (
          <form onSubmit={(e) => { e.preventDefault(); onAnswer(draft); }}>
            <Input autoFocus type="date" value={draft as string} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDraft(e.target.value)} />
            <Button type="submit" className="mt-5 w-full bg-[var(--brand)] py-3 text-base" loading={busy} disabled={step.required && !draft}>Continuer</Button>
          </form>
        )}
        {step.type === "photos" && (
          <div>
            <label className={cx("flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line bg-white p-6 text-center hover:border-[var(--brand)]", uploading && "opacity-60")}>
              <span className="text-3xl">📷</span>
              <span className="font-medium">Ajouter des photos ou un document</span>
              <span className="text-xs text-ink-soft">JPEG, PNG, WebP ou PDF · 10 Mo maximum · {step.max_files} fichiers maximum</span>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" disabled={uploading}
                onChange={async (e) => {
                  const list = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  setUploadError("");
                  setUploading(true);
                  let ids = draft as string[];
                  const added: { id: string; original_name: string }[] = [];
                  for (const f of list) {
                    if (ids.length >= step.max_files) { setUploadError(`${step.max_files} fichiers maximum.`); break; }
                    const form = new FormData();
                    form.append("file", f);
                    try {
                      const r = await api<{ id: string; name: string }>(uploadUrl, { method: "POST", form, headers });
                      ids = [...ids, r.id];
                      added.push({ id: r.id, original_name: r.name });
                    } catch (err) { setUploadError(`${f.name} : ${errorMessage(err)}`); }
                  }
                  setDraft(ids);
                  onFilesChange([...files, ...added]);
                  setUploading(false);
                }} />
            </label>
            {uploading && <p className="mt-2 flex items-center gap-2 text-sm text-ink-soft"><Spinner /> Envoi en cours…</p>}
            {uploadError && <div className="mt-2"><Alert>{uploadError}</Alert></div>}
            <ul className="mt-3 space-y-1">
              {(draft as string[]).map((id) => (
                <li key={id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                  <span>📎 {files.find((f) => f.id === id)?.original_name ?? "Fichier"}</span>
                  <button className="text-xs underline" onClick={() => setDraft((draft as string[]).filter((x) => x !== id))}>Retirer</button>
                </li>
              ))}
            </ul>
            {next((draft as string[]).length ? draft : null, !uploading && (!step.required || (draft as string[]).length > 0))}
          </div>
        )}
        {skip}
      </div>
    </div>
  );
}

function ContactForm({ contact, setContact, meetingType, tenantName, hold, timezone, onNext }: {
  contact: Contact; setContact: (c: Contact) => void; meetingType: string; tenantName: string;
  hold: NonNullable<Hold>; timezone: string; onNext: () => void;
}) {
  const needsAddress = meetingType === "on_site";
  const needsPhone = meetingType === "on_site" || meetingType === "phone";
  const set = (k: keyof Contact) => (e: React.ChangeEvent<HTMLInputElement>) => setContact({ ...contact, [k]: e.target.value });
  const setAddr = (k: keyof Contact["address"]) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setContact({ ...contact, address: { ...contact.address, [k]: e.target.value } });
  const minutesLeft = Math.max(0, Math.round((new Date(hold.hold_expires_at).getTime() - Date.now()) / 60000));

  return (
    <form className="fade-in space-y-4" onSubmit={(e) => { e.preventDefault(); onNext(); }}>
      <h2 className="text-2xl font-semibold tracking-tight">Vos coordonnées</h2>
      <p className="text-sm text-ink-soft">
        Créneau réservé pour vous : <strong className="text-ink">{fmtDateTime(hold.starts_at, timezone)}</strong>
        {minutesLeft > 0 && ` (pendant encore ${minutesLeft} min)`}.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom"><Input required value={contact.first_name} onChange={set("first_name")} autoComplete="given-name" /></Field>
        <Field label="Nom"><Input value={contact.last_name} onChange={set("last_name")} autoComplete="family-name" /></Field>
      </div>
      <Field label="Email" hint="Pour recevoir la confirmation et le lien de gestion du rendez-vous.">
        <Input required type="email" value={contact.email} onChange={set("email")} autoComplete="email" inputMode="email" />
      </Field>
      <Field label={needsPhone ? "Téléphone" : "Téléphone (facultatif)"}>
        <Input required={needsPhone} type="tel" value={contact.phone} onChange={set("phone")} autoComplete="tel" inputMode="tel" />
      </Field>
      {needsAddress && (
        <>
          <Field label="Adresse du rendez-vous"><Input required value={contact.address.line} onChange={setAddr("line")} autoComplete="street-address" /></Field>
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <Field label="Code postal"><Input required value={contact.address.postal_code} onChange={setAddr("postal_code")} autoComplete="postal-code" inputMode="numeric" /></Field>
            <Field label="Ville"><Input required value={contact.address.city} onChange={setAddr("city")} autoComplete="address-level2" /></Field>
          </div>
        </>
      )}
      {contact.phone && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={contact.consent_sms_reminders} onChange={(e) => setContact({ ...contact, consent_sms_reminders: e.target.checked })} />
          <span>J&apos;accepte de recevoir un rappel de rendez-vous par SMS.</span>
        </label>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" required checked={contact.accept_privacy} onChange={(e) => setContact({ ...contact, accept_privacy: e.target.checked })} />
        <span>J&apos;accepte que {tenantName} utilise ces informations pour organiser ce rendez-vous et me recontacter à son sujet. Elles ne sont ni revendues ni partagées avec d&apos;autres entreprises.</span>
      </label>
      <Button type="submit" className="w-full bg-[var(--brand)] py-3 text-base">Vérifier ma demande</Button>
    </form>
  );
}

function icsFile(done: Done, tenantName: string): string {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Venio//FR", "BEGIN:VEVENT",
    `UID:${fmt(done.booking.starts_at)}-${Math.random().toString(36).slice(2)}@venio`, `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(done.booking.starts_at)}`, `DTEND:${fmt(done.booking.ends_at)}`,
    `SUMMARY:${done.booking.service_name} — ${tenantName}`, `DESCRIPTION:Gérer le rendez-vous : ${done.manage_url}`,
    "END:VEVENT", "END:VCALENDAR"];
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join("\r\n"))}`;
}

function Success({ done, tenantName, timezone }: { done: Done; tenantName: string; timezone: string }) {
  return (
    <div className="fade-in space-y-5 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl">✓</div>
      <h2 className="text-2xl font-semibold tracking-tight">Rendez-vous confirmé</h2>
      <p className="text-lg first-letter:uppercase">{fmtDateTime(done.booking.starts_at, timezone)}</p>
      <p className="text-ink-soft">{done.booking.service_name} · {MEETING_LABELS[done.booking.meeting_type]}</p>
      <p className="text-sm text-ink-soft">{DEMO ? "Démonstration : aucun email n'est envoyé." : "Un email de confirmation vous est envoyé."} {tenantName} a bien reçu votre demande.</p>
      <div className="flex flex-col gap-2">
        <a href={icsFile(done, tenantName)} download="rendez-vous.ics" className="rounded-lg border border-line bg-white py-3 font-medium">Ajouter à mon agenda</a>
        <a href={done.manage_url} className="rounded-lg py-3 text-sm underline">Reporter ou annuler</a>
      </div>
    </div>
  );
}
