"use client";
import { CheckCircle2, ChevronRight, Circle, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, IconButton } from "@/components/ui";
import { api } from "@/lib/api";
import { DEMO } from "@/lib/routes";

type Step = { key: string; label: string; done: boolean; href: string; optional?: boolean };
type Onboarding = { steps: Step[]; done: number; total: number; dismissed: boolean };

/** Assistant de configuration : étapes calculées à partir de l'état réel de l'espace, reprenables à tout moment. */
export function OnboardingCard() {
  const [o, setO] = useState<Onboarding | null>(null);
  useEffect(() => { if (!DEMO) api<Onboarding>("/onboarding").then(setO).catch(() => {}); }, []);
  if (!o || o.dismissed || o.done === o.total) return null;
  const update = async (body: object) => setO(await api<Onboarding>("/onboarding", { method: "POST", body }));
  const pct = Math.round((100 * o.done) / o.total);
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Configurer votre espace</h2>
          <p className="mt-0.5 text-sm text-ink-muted">{o.done} étape(s) sur {o.total} · quelques minutes pour recevoir vos premières réservations.</p>
        </div>
        <IconButton label="Masquer l'assistant" onClick={() => update({ dismiss: true })}><X className="h-4 w-4" /></IconButton>
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-label="Configuration de l'espace" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-signal transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <ol className="mt-4 divide-y divide-line">
        {o.steps.map((s) => (
          <li key={s.key} className="flex items-center gap-3 py-2.5">
            {s.done ? <CheckCircle2 aria-hidden className="h-5 w-5 shrink-0 text-success" /> : <Circle aria-hidden className="h-5 w-5 shrink-0 text-line-strong" />}
            <span className={s.done ? "flex-1 text-ink-muted line-through decoration-ink-subtle/50" : "flex-1 font-medium"}>
              {s.label}<span className="sr-only">{s.done ? " : fait" : " : à faire"}</span>
            </span>
            {!s.done && s.optional && <button type="button" className="text-sm text-ink-muted underline" onClick={() => update({ skip: s.key })}>Plus tard</button>}
            {!s.done && <Link href={s.href} className="inline-flex items-center gap-0.5 text-sm font-medium text-signal-strong">Faire<ChevronRight aria-hidden className="h-4 w-4" /></Link>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
