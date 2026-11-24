"use client";
import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, buttonClass, cx } from "@/components/ui";
import type { PublicPlans } from "@/lib/server";

const euros = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

/** Uniquement ce que le produit fait réellement aujourd'hui (vérifié dans le code). */
function included(e: Record<string, unknown>): string[] {
  const sms = Number(e["limit.sms_credits_per_month"] ?? 0);
  const lines = Number(e["limit.phone_lines"] ?? 1);
  return [
    "Page de réservation à votre nom, avec un parcours de questions adapté à votre métier",
    "Créneaux réellement libres, calculés sur vos horaires, vos absences et vos trajets",
    "Confirmation, rappel la veille et lien pour reporter ou annuler, par email",
    "Dossier complet pour chaque demande : réponses, photos, adresse, historique",
    `Récupération des appels manqués : ${lines} ligne suivie et ${sms} SMS inclus par mois (version pilote)`,
    "Rendez-vous et parcours illimités, statistiques de conversion",
  ];
}

export function PricingTable({ data }: { data: PublicPlans }) {
  const [interval, setInterval_] = useState<"month" | "year">("month");
  const p = data.plans[0];
  if (!p) return null;
  const monthly = interval === "month" ? p.monthly_cents : Math.round(p.yearly_cents / 12);
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="flex flex-col rounded-frame border border-ink bg-surface p-7 shadow-float md:p-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-semibold text-ink">{p.name}</h3>
          <div role="radiogroup" aria-label="Période de facturation" className="inline-flex rounded-control border border-line bg-paper p-0.5 text-sm">
            {([["month", "Mensuel"], ["year", "Annuel · 2 mois offerts"]] as const).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={interval === v} onClick={() => setInterval_(v)}
                className={cx("rounded-[5px] px-3 py-1.5 font-medium transition-colors", interval === v ? "bg-ink text-white" : "text-ink-muted hover:text-ink")}>{l}</button>
            ))}
          </div>
        </div>
        <p className="mt-6"><span className="tabular text-6xl font-semibold tracking-tight text-ink">{euros(monthly)}</span><span className="text-ink-muted"> HT / mois</span></p>
        <p className="mt-1 text-sm text-ink-muted">
          {interval === "year" ? `${euros(p.yearly_cents)} HT facturés une fois par an` : "Sans engagement, résiliable à tout moment"} · par entreprise
        </p>
        <ul className="mt-7 flex-1 space-y-3">
          {included(p.entitlements).map((t) => <li key={t} className="flex gap-2.5 text-ink"><Check aria-hidden className="mt-1 h-4 w-4 shrink-0 text-success" />{t}</li>)}
        </ul>
        <Link href={`/inscription?periode=${interval}`} className={cx(buttonClass("primary", "lg"), "mt-8 w-full")}>Commencer l&apos;essai gratuit</Link>
        <p className="mt-3 text-center text-sm text-ink-muted">{data.trial_days} jours d&apos;essai, sans carte bancaire.</p>
      </div>

      <div className="space-y-6">
        <div className="rounded-frame border border-line bg-surface p-7">
          <h3 className="font-semibold text-ink">Besoin de plus de SMS ?</h3>
          <p className="mt-2 text-sm text-ink-muted">Au-delà des SMS inclus, des packs prépayés, sans date d&apos;expiration. Jamais de dépassement facturé par surprise : sans crédit, les appels restent enregistrés mais aucun SMS ne part.</p>
          <ul className="mt-3 space-y-1 text-sm">{data.packs.map((k) => <li key={k.code} className="tabular">{k.credits} SMS · <span className="font-medium">{euros(k.cents)} HT</span></li>)}</ul>
          <p className="mt-3 text-xs text-ink-subtle">1 crédit = 1 SMS de 160 caractères. Nos modèles de message tiennent en un seul SMS.</p>
        </div>
        <div className="rounded-frame border border-line bg-surface p-7">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink">Ce qui arrive ensuite</h3><Badge tone="neutral">Pas encore disponible</Badge></div>
          <p className="mt-2 text-sm text-ink-muted">Accès pour vos collaborateurs, rappels par SMS, messagerie avec vos clients. Ils ne sont pas inclus aujourd&apos;hui : nous l&apos;annoncerons quand ils le seront.</p>
        </div>
      </div>
    </div>
  );
}
