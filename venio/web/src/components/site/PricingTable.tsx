"use client";
import { Check, Minus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, buttonClass, cx } from "@/components/ui";
import type { PublicPlans } from "@/lib/server";

const euros = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

const ROWS: [string, string, (v: unknown) => string | boolean][] = [
  ["feature.missed_calls", "Récupération des appels manqués (pilote)", (v) => v === true],
  ["limit.phone_lines", "Lignes téléphoniques suivies", (v) => String(v ?? "—")],
  ["limit.sms_credits_per_month", "Crédits SMS inclus par mois", (v) => String(v ?? 0)],
  ["limit.members", "Utilisateurs", (v) => String(v ?? "—")],
  ["limit.bookings_per_month", "Rendez-vous par mois", (v) => (v === null ? "Illimités" : String(v))],
  ["limit.flows", "Parcours publiés", (v) => (v === null ? "Illimités" : String(v))],
  ["feature.messaging", "Messagerie client", (v) => v === true],
];
const ALWAYS = ["Page de réservation et parcours par métier", "Créneaux réels et anti-double réservation", "Confirmations et rappels par email", "Dossier client et statistiques"];

export function PricingTable({ data }: { data: PublicPlans }) {
  const [interval, setInterval_] = useState<"month" | "year">("month");
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-ink-muted">Prix par entreprise, hors taxes. {data.trial_days} jours d&apos;essai sans carte bancaire.</p>
        <div role="radiogroup" aria-label="Période de facturation" className="inline-flex rounded-control border border-line bg-surface p-0.5 text-sm">
          {([["month", "Mensuel"], ["year", "Annuel · 2 mois offerts"]] as const).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={interval === v} onClick={() => setInterval_(v)}
              className={cx("rounded-[5px] px-3 py-1.5 font-medium transition-colors", interval === v ? "bg-ink text-white" : "text-ink-muted hover:text-ink")}>{l}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {data.plans.map((p) => {
          const featured = p.code === "pro";
          return (
            <div key={p.code} className={cx("flex flex-col rounded-frame border bg-surface p-7", featured ? "border-ink shadow-float" : "border-line")}>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-ink">{p.name}</h3>
                {featured && <Badge tone="accent">Recommandé</Badge>}
              </div>
              <p className="mt-5"><span className="tabular text-5xl font-semibold tracking-tight text-ink">{euros(interval === "month" ? p.monthly_cents : Math.round(p.yearly_cents / 12))}</span><span className="text-ink-muted"> HT / mois</span></p>
              <p className="mt-1 text-sm text-ink-muted">{interval === "year" ? `${euros(p.yearly_cents)} HT facturés par an` : "Sans engagement, résiliable à tout moment"}</p>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                {ROWS.map(([key, label, fmt]) => {
                  const v = fmt(p.entitlements[key]);
                  if (v === false) return <li key={key} className="flex gap-2 text-ink-subtle"><Minus aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />{label}<span className="sr-only"> : non inclus</span></li>;
                  return <li key={key} className="flex gap-2 text-ink"><Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" />{v === true ? label : <span><span className="tabular font-medium">{v}</span> · {label.toLowerCase()}</span>}</li>;
                })}
              </ul>
              <Link href={`/inscription?offre=${p.code}&periode=${interval}`} className={cx(buttonClass(featured ? "primary" : "secondary", "lg"), "mt-8 w-full")}>Commencer l&apos;essai</Link>
            </div>
          );
        })}
      </div>

      <div className="mt-10 grid gap-6 rounded-frame border border-line bg-surface p-7 md:grid-cols-2">
        <div>
          <h3 className="font-semibold text-ink">Inclus dans toutes les offres</h3>
          <ul className="mt-3 space-y-2 text-sm">{ALWAYS.map((a) => <li key={a} className="flex gap-2"><Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" />{a}</li>)}</ul>
        </div>
        <div>
          <h3 className="font-semibold text-ink">Crédits SMS supplémentaires</h3>
          <p className="mt-3 text-sm text-ink-muted">Au-delà des crédits inclus, des packs prépayés, sans expiration. Jamais de dépassement facturé par surprise : à 100 %, les appels restent enregistrés mais aucun SMS ne part.</p>
          <ul className="mt-3 space-y-1 text-sm">{data.packs.map((k) => <li key={k.code} className="tabular">{k.credits} crédits · <span className="font-medium">{euros(k.cents)} HT</span></li>)}</ul>
          <p className="mt-3 text-xs text-ink-subtle">1 crédit = 1 SMS facturé de 160 caractères. Nos modèles de message tiennent en un seul SMS.</p>
        </div>
      </div>
    </div>
  );
}
