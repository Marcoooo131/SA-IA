"use client";
import { useCallback, useEffect, useState } from "react";
import { useMe } from "@/components/AppShell";
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Spinner } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { pct } from "@/lib/format";
import type { FlowDefinition } from "@/lib/flow";

type FlowInfo = {
  name: string;
  published: { version: number; definition: FlowDefinition; published_at: string } | null;
  draft: { version: number; definition: FlowDefinition } | null;
};
type Funnel = {
  totals: { starts: number; slots: number; bookings: number }; reliable: boolean; note: string;
  steps: { step: string; title: string; viewed: number; answered: number; drop_rate: number | null }[];
};

const TYPE_LABELS: Record<string, string> = {
  single_choice: "Choix unique", multi_choice: "Choix multiples", yes_no: "Oui / non", text: "Texte court", long_text: "Texte libre",
  number: "Nombre", slider: "Curseur", date: "Date", photos: "Photos / documents",
};

export default function FlowPage() {
  const me = useMe();
  const [info, setInfo] = useState<FlowInfo | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [def, setDef] = useState<FlowDefinition | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string; details?: string[] } | null>(null);
  const canEdit = me.role !== "member";

  const load = useCallback(async () => {
    const [i, f] = await Promise.all([api<FlowInfo>("/settings/flow"), api<Funnel>("/funnel?days=30")]);
    setInfo(i);
    setFunnel(f);
    setDef(structuredClone((i.draft ?? i.published)!.definition));
    setDirty(false);
  }, []);
  useEffect(() => { load().catch((e) => setMsg({ kind: "error", text: errorMessage(e) })); }, [load]);

  function edit(fn: (d: FlowDefinition) => void) {
    if (!def) return;
    const copy = structuredClone(def);
    fn(copy);
    setDef(copy);
    setDirty(true);
  }

  async function save(publish: boolean) {
    setBusy(publish ? "publish" : "save");
    setMsg(null);
    try {
      if (dirty || publish) await api("/settings/flow/draft", { method: "PUT", body: { definition: def } });
      if (publish) {
        const r = await api<{ published_version: number }>("/settings/flow/publish", { method: "POST" });
        setMsg({ kind: "success", text: `Version ${r.published_version} publiée. Les demandes déjà commencées continuent sur l'ancienne version.` });
      } else setMsg({ kind: "success", text: "Brouillon enregistré (non visible par vos clients tant qu'il n'est pas publié)." });
      await load();
    } catch (e) {
      const details = e instanceof ApiError ? (e.extra.errors as { loc: string; message: string }[] | undefined)?.map((x) => `${x.loc} : ${x.message}`) : undefined;
      setMsg({ kind: "error", text: errorMessage(e), details });
    } finally {
      setBusy("");
    }
  }

  if (!info || !def) return msg ? <Alert>{msg.text}</Alert> : <Spinner />;
  const stats = Object.fromEntries((funnel?.steps ?? []).map((s) => [s.step, s]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Parcours de réservation</h1>
          <p className="text-sm text-ink-muted">Version publiée : {info.published?.version}{info.draft && <> · <Badge tone="accent">brouillon v{info.draft.version} en cours</Badge></>}</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="secondary" loading={busy === "save"} disabled={!dirty} onClick={() => save(false)}>Enregistrer le brouillon</Button>
            <Button loading={busy === "publish"} disabled={!dirty && !info.draft} onClick={() => save(true)}>Publier</Button>
          </div>
        )}
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}{msg.details && <ul className="mt-1 list-disc pl-5">{msg.details.map((d) => <li key={d}>{d}</li>)}</ul>}</Alert>}

      {funnel && (
        <Card>
          <h2 className="font-semibold">30 derniers jours</h2>
          <p className="mt-1 text-sm">{funnel.totals.starts} parcours démarrés → {funnel.totals.slots} ont vu les créneaux → {funnel.totals.bookings} rendez-vous</p>
          <p className="mt-1 text-xs text-ink-muted">{funnel.reliable ? funnel.note : `Volume encore faible (${funnel.totals.starts} parcours) : les chiffres par question sont des tendances, pas des conclusions.`}</p>
        </Card>
      )}

      <Card className="space-y-3">
        <Field label="Message d'accueil"><Input maxLength={300} disabled={!canEdit} value={def.intro ?? ""} onChange={(e) => edit((d) => { d.intro = e.target.value || undefined; })} /></Field>
      </Card>

      {def.steps.map((step, i) => {
        const s = stats[step.id];
        return (
          <Card key={step.id} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
              <span>Question {i + 1} · {TYPE_LABELS[step.type]}{step.routes?.length ? " · avec conditions" : ""}</span>
              {s && s.viewed > 0 && <span>vue par {s.viewed} · répondue par {s.answered} · abandon {pct(s.drop_rate)}</span>}
            </div>
            <Field label="Question"><Input disabled={!canEdit} maxLength={160} value={step.title} onChange={(e) => edit((d) => { d.steps[i].title = e.target.value; })} /></Field>
            <Field label="Aide (facultatif)"><Input disabled={!canEdit} maxLength={300} value={step.help ?? ""} onChange={(e) => edit((d) => { d.steps[i].help = e.target.value || undefined; })} /></Field>
            {step.options.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {step.options.map((o, j) => (
                  <div key={o.value} className="flex items-center gap-2">
                    <Input disabled={!canEdit} className="w-14 text-center" maxLength={8} value={o.icon ?? ""} onChange={(e) => edit((d) => { d.steps[i].options[j].icon = e.target.value || undefined; })} aria-label="Icône" />
                    <Input disabled={!canEdit} maxLength={80} value={o.label} onChange={(e) => edit((d) => { d.steps[i].options[j].label = e.target.value; })} aria-label="Libellé du choix" />
                  </div>
                ))}
              </div>
            )}
            <Checkbox disabled={!canEdit} checked={step.required} onChange={(e) => edit((d) => { d.steps[i].required = e.target.checked; })}
              label="Réponse obligatoire" />
          </Card>
        );
      })}
      <p className="text-xs text-ink-muted">Cet éditeur modifie les textes, les icônes et le caractère obligatoire des questions. L&apos;ajout de questions et de conditions depuis l&apos;interface arrive dans la prochaine version ; en attendant, nous les configurons pour vous.</p>
    </div>
  );
}
