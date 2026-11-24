"use client";
import { Check, CreditCard, ExternalLink, MessageSquareText, Minus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useMe } from "@/components/AppShell";
import { Alert, Badge, Button, Card, CardHeader, Skeleton, Table, Td, Th, cx, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { DEMO } from "@/lib/routes";

type Plan = { code: string; name: string; monthly_cents: number; yearly_cents: number; purchasable: boolean; entitlements: Record<string, unknown> };
type Billing = {
  configured: boolean; test_mode: boolean;
  subscription: { status: string; plan_code: string; plan_name: string; billing_interval: "month" | "year"; trial_ends_at: string | null;
    current_period_end: string | null; cancel_at_period_end: boolean; past_due_since: string | null; has_stripe: boolean; has_customer: boolean } | null;
  access: { state: string; public_blocked: boolean; days_left: number | null; grace_ends_at: string | null };
  plans: Plan[];
  packs: { code: string; credits: number; cents: number; name: string }[];
  credits: { monthly_limit: number; monthly_used: number; extra_balance: number };
  grants: { credits: number; source: string; amount_cents: number | null; created_at: string }[];
};

const euros = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

const ROWS: [string, string, (v: unknown) => string | boolean][] = [
  ["feature.missed_calls", "Récupération des appels manqués", (v) => v === true],
  ["limit.phone_lines", "Lignes téléphoniques suivies", (v) => String(v ?? "—")],
  ["limit.sms_credits_per_month", "Crédits SMS inclus / mois", (v) => String(v ?? 0)],
  ["limit.members", "Utilisateurs", (v) => String(v ?? "—")],
  ["limit.bookings_per_month", "Rendez-vous / mois", (v) => (v === null ? "Illimités" : String(v))],
  ["limit.flows", "Parcours publiés", (v) => (v === null ? "Illimités" : String(v))],
];

const STATUS: Record<string, { label: string; tone: "good" | "bad" | "warning" | "info" | "neutral" }> = {
  trial: { label: "Essai gratuit", tone: "info" }, trial_paid: { label: "Essai — abonnement enregistré", tone: "good" },
  trial_expired: { label: "Essai terminé", tone: "bad" }, active: { label: "Actif", tone: "good" },
  past_due: { label: "Paiement en retard", tone: "warning" }, restricted: { label: "Suspendu (impayé)", tone: "bad" },
  canceled: { label: "Résilié", tone: "bad" }, incomplete: { label: "Paiement en cours", tone: "info" }, none: { label: "—", tone: "neutral" },
};

export default function SubscriptionPage() {
  const me = useMe();
  const toast = useToast();
  const [b, setB] = useState<Billing | null>(null);
  const [error, setError] = useState("");
  const [interval, setInterval_] = useState<"month" | "year">("month");
  const [busy, setBusy] = useState("");
  const [ret, setRet] = useState<string | null>(null);
  const canPay = me.role !== "member";

  const load = useCallback(async () => {
    try { setB(await api<Billing>("/billing")); setError(""); } catch (e) { setError(errorMessage(e)); }
  }, []);

  useEffect(() => {
    if (DEMO) return;
    const r = new URLSearchParams(window.location.search).get("retour");
    setRet(r);
    load();
    // Retour du paiement : l'activation arrive par le webhook Stripe, quelques secondes après.
    if (r === "succes" || r === "pack") {
      let n = 0;
      const t = setInterval(() => { load(); if (++n >= 8) clearInterval(t); }, 2500);
      return () => clearInterval(t);
    }
  }, [load]);

  const go = async (key: string, path: string, body?: unknown) => {
    setBusy(key);
    try { const { url } = await api<{ url: string }>(path, { method: "POST", body }); window.location.href = url; }
    catch (e) { toast(errorMessage(e), "error"); setBusy(""); }
  };

  if (DEMO) return <div className="space-y-5"><h1 className="text-2xl font-semibold tracking-tight">Abonnement</h1><Alert kind="info">La démonstration hors ligne ne comprend pas le paiement : il est disponible dans la version en ligne (Stripe, mode test).</Alert></div>;

  const sub = b?.subscription;
  const st = b ? STATUS[b.access.state] ?? STATUS.none : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Abonnement</h1>
        <p className="mt-1 text-sm text-ink-muted">Par entreprise, sans engagement. Prix hors taxes.</p>
      </div>

      {b?.test_mode && b.configured && <Alert kind="info" title="Paiement en mode test">Aucun paiement réel : utilisez la carte de test Stripe 4242 4242 4242 4242, une date future et n&apos;importe quel code.</Alert>}
      {ret === "succes" && <Alert kind="success" title="Merci !">Votre abonnement est enregistré. Son activation peut prendre quelques secondes.</Alert>}
      {ret === "pack" && <Alert kind="success">Paiement reçu : vos crédits SMS seront ajoutés dans quelques secondes.</Alert>}
      {ret === "annule" && <Alert kind="warning">Paiement annulé : rien n&apos;a été prélevé.</Alert>}
      {error && <Alert>{error}</Alert>}
      {b && !b.configured && <Alert kind="warning">Le paiement en ligne n&apos;est pas encore activé sur cette plateforme. Votre essai continue normalement.</Alert>}

      {!b ? <Card className="space-y-3"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-4 w-2/3" /></Card> : sub && st && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-ink-muted">Offre actuelle</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{sub.plan_name} <Badge tone={st.tone}>{st.label}</Badge></p>
              <p className="mt-2 text-sm text-ink-muted">
                {b.access.state === "trial" && <>Essai gratuit : {b.access.days_left} jour(s) restant(s){sub.trial_ends_at && ` (jusqu'au ${fmtDate(sub.trial_ends_at, me.tenant.timezone)})`}. Choisissez une offre pour continuer sans interruption.</>}
                {b.access.state === "trial_paid" && sub.trial_ends_at && <>Premier prélèvement le {fmtDate(sub.trial_ends_at, me.tenant.timezone)}, à la fin de votre essai.</>}
                {b.access.state === "trial_expired" && <>Votre essai est terminé : votre page n&apos;accepte plus de nouvelles réservations. Vos données sont conservées.</>}
                {b.access.state === "active" && sub.current_period_end && <>{sub.cancel_at_period_end ? "Résiliation programmée le " : "Prochain renouvellement le "}{fmtDate(sub.current_period_end, me.tenant.timezone)} · facturation {sub.billing_interval === "year" ? "annuelle" : "mensuelle"}.</>}
                {b.access.state === "past_due" && b.access.grace_ends_at && <>Le dernier paiement a échoué. Mettez à jour votre carte avant le {fmtDate(b.access.grace_ends_at, me.tenant.timezone)} pour éviter la suspension des réservations.</>}
                {(b.access.state === "restricted" || b.access.state === "canceled") && <>Les nouvelles réservations sont suspendues. Les rendez-vous déjà confirmés sont maintenus.</>}
              </p>
            </div>
            {sub.has_customer && canPay && (
              <Button variant="secondary" loading={busy === "portal"} icon={<ExternalLink aria-hidden className="h-4 w-4" />} onClick={() => go("portal", "/billing/portal")}>
                Gérer mon abonnement
              </Button>
            )}
          </div>
          {sub.has_customer && <p className="mt-3 text-xs text-ink-subtle">Factures, carte bancaire, changement d&apos;offre et résiliation : sur l&apos;espace sécurisé Stripe.</p>}
        </Card>
      )}

      {b && (!sub?.has_stripe || b.access.state === "canceled") && (
        <section aria-labelledby="offres" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="offres" className="text-lg font-semibold">Choisir une offre</h2>
            <div role="radiogroup" aria-label="Période de facturation" className="inline-flex rounded-control border border-line bg-surface p-0.5 text-sm">
              {([["month", "Mensuel"], ["year", "Annuel · 2 mois offerts"]] as const).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={interval === v} onClick={() => setInterval_(v)}
                  className={cx("rounded-[5px] px-3 py-1.5 font-medium transition-colors", interval === v ? "bg-ink text-white" : "text-ink-muted hover:text-ink")}>{l}</button>
              ))}
            </div>
          </div>
          <Table>
            <thead>
              <tr>
                <Th className="w-1/4"><span className="sr-only">Fonctionnalité</span></Th>
                {b.plans.map((p) => (
                  <th key={p.code} scope="col" className={cx("border-b border-line px-4 py-3 text-left align-top font-normal", p.code === "pro" ? "bg-signal-soft/60" : "bg-sunken/50")}>
                    <span className="block text-base font-semibold text-ink">{p.name}{p.code === "pro" && <span className="ml-2 align-middle"><Badge tone="accent">Recommandé</Badge></span>}</span>
                    <span className="mt-1 block text-2xl font-semibold text-ink">{euros(interval === "month" ? p.monthly_cents : Math.round(p.yearly_cents / 12))}<span className="text-sm font-normal text-ink-muted"> HT / mois</span></span>
                    <span className="block text-xs text-ink-muted">{interval === "year" ? `soit ${euros(p.yearly_cents)} HT facturés par an` : "sans engagement"}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([key, label, fmt]) => (
                <tr key={key}>
                  <Td className="text-ink-muted">{label}</Td>
                  {b.plans.map((p) => {
                    const v = fmt(p.entitlements[key]);
                    return <Td key={p.code} className={cx("tabular", p.code === "pro" && "bg-signal-soft/30")}>
                      {v === true ? <Check aria-label="Inclus" className="h-4 w-4 text-success" /> : v === false ? <Minus aria-label="Non inclus" className="h-4 w-4 text-ink-subtle" /> : v}
                    </Td>;
                  })}
                </tr>
              ))}
              <tr>
                <Td><span className="sr-only">Choisir</span></Td>
                {b.plans.map((p) => (
                  <Td key={p.code} className={cx(p.code === "pro" && "bg-signal-soft/30")}>
                    <Button variant={p.code === "pro" ? "primary" : "secondary"} className="w-full" disabled={!canPay || !b.configured || !p.purchasable}
                      loading={busy === p.code} onClick={() => go(p.code, "/billing/checkout", { plan: p.code, interval })}>
                      Choisir {p.name}
                    </Button>
                  </Td>
                ))}
              </tr>
            </tbody>
          </Table>
          <p className="text-xs text-ink-subtle">
            {b.access.state === "trial" ? "Votre essai gratuit est conservé : la carte est enregistrée maintenant, le premier prélèvement a lieu à la fin de l'essai. " : ""}
            Paiement sécurisé par Stripe. {!canPay && "Seuls les administrateurs de l'espace peuvent souscrire."}
          </p>
        </section>
      )}

      {b && (
        <Card>
          <CardHeader title="Crédits SMS" description="Utilisés par la récupération des appels manqués. Le forfait du mois est consommé en premier, puis les crédits achetés, qui n'expirent pas." />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-card border border-line p-4">
              <p className="text-sm text-ink-muted">Forfait du mois</p>
              <p className="tabular mt-1 text-2xl font-semibold">{b.credits.monthly_used} <span className="text-base font-normal text-ink-muted">/ {b.credits.monthly_limit} utilisés</span></p>
            </div>
            <div className="rounded-card border border-line p-4">
              <p className="text-sm text-ink-muted">Crédits achetés disponibles</p>
              <p className="tabular mt-1 text-2xl font-semibold">{b.credits.extra_balance}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            {b.packs.map((p) => (
              <Button key={p.code} variant="secondary" disabled={!canPay || !b.configured} loading={busy === p.code}
                icon={<MessageSquareText aria-hidden className="h-4 w-4" />} onClick={() => go(p.code, "/billing/sms-pack", { pack: p.code })}>
                {p.credits} crédits · {euros(p.cents)} HT
              </Button>
            ))}
          </div>
          {b.grants.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm text-ink-muted">
              {b.grants.map((g, i) => <li key={i} className="flex items-center gap-2"><CreditCard aria-hidden className="h-4 w-4" />+{g.credits} crédits le {fmtDate(g.created_at, me.tenant.timezone)}{g.amount_cents ? ` · ${euros(g.amount_cents)} HT` : ""}</li>)}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
