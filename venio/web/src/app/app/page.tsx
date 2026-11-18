"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMe } from "@/components/AppShell";
import { Alert, Button, Card, Kpi, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { pct } from "@/lib/format";
import { caseFilePath, publicPagePath, withBase } from "@/lib/routes";

import { BookingRow, type Row } from "@/components/BookingRow";

type Dashboard = {
  today: Row[]; upcoming: Row[];
  new_cases: { id: string; created_at: string; summary: string; completeness: number; first_name: string; last_name: string | null; service_name: string }[];
  counts: Record<string, number>;
  rates_30d: { conversion: number | null; abandon: number | null; no_show: number | null; sample_size: number; reliable: boolean };
};

export default function DashboardPage() {
  const me = useMe();
  const [d, setD] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { api<Dashboard>("/dashboard").then(setD).catch((e) => setError(errorMessage(e))); }, []);

  const welcome = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("bienvenue");
  const tz = me.tenant.timezone;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Bonjour {me.user.full_name.split(" ")[0]}</h1>
        <div className="flex items-center gap-2">
          <code className="hidden rounded bg-surface px-2 py-1 text-xs text-ink-muted sm:block">{me.public_url}</code>
          <Button variant="secondary" onClick={async () => { await navigator.clipboard.writeText(me.public_url); setCopied(true); }}>
            {copied ? "Lien copié ✓" : "Copier mon lien de réservation"}
          </Button>
        </div>
      </div>

      {welcome && (
        <Alert kind="success">
          Votre page est en ligne. Prochaines étapes : <Link className="underline" href="/app/parametres">vérifiez vos horaires et vos coordonnées</Link>,
          faites une réservation test sur <a className="underline" href={withBase(publicPagePath(me.tenant.slug))} target="_blank">votre page</a>, puis partagez le lien
          (site web, fiche Google, signature d&apos;email).
        </Alert>
      )}
      {error && <Alert>{error}</Alert>}
      {!d ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Nouvelles demandes" value={d.counts.new_requests} href="/app/dossiers?status=new" />
            <Stat label="Demandes en attente" value={d.counts.pending} href="/app/dossiers" />
            <Stat label="Rendez-vous (30 j)" value={d.counts.bookings} />
            <Stat label="Annulations (30 j)" value={d.counts.cancelled} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-semibold">Aujourd&apos;hui</h2>
              {d.today.length === 0 ? <p className="text-sm text-ink-muted">Aucun rendez-vous aujourd&apos;hui.</p> : (
                <ul className="divide-y divide-line">{d.today.map((b) => <BookingRow key={b.id} b={b} tz={tz} timeOnly />)}</ul>
              )}
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">Nouvelles demandes</h2>
              {d.new_cases.length === 0 ? <p className="text-sm text-ink-muted">Rien de nouveau. Partagez votre lien pour recevoir des demandes.</p> : (
                <ul className="divide-y divide-line">
                  {d.new_cases.map((c) => (
                    <li key={c.id} className="py-2.5">
                      <Link href={caseFilePath(c.id)} className="block hover:underline">
                        <span className="font-medium">{c.first_name} {c.last_name}</span> <span className="text-sm text-ink-muted">· {c.service_name}</span>
                        <span className="line-clamp-1 text-sm text-ink-muted">{c.summary}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card>
            <h2 className="mb-3 font-semibold">Prochains rendez-vous</h2>
            {d.upcoming.length === 0 ? <p className="text-sm text-ink-muted">Aucun rendez-vous à venir.</p> : (
              <ul className="divide-y divide-line">{d.upcoming.map((b) => <BookingRow key={b.id} b={b} tz={tz} />)}</ul>
            )}
          </Card>

          <Card>
            <h2 className="font-semibold">Conversion sur 30 jours</h2>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div><p className="tabular text-2xl font-semibold">{pct(d.rates_30d.conversion)}</p><p className="text-xs text-ink-muted">démarrages → rendez-vous</p></div>
              <div><p className="tabular text-2xl font-semibold">{pct(d.rates_30d.abandon)}</p><p className="text-xs text-ink-muted">abandons</p></div>
              <div><p className="tabular text-2xl font-semibold">{pct(d.rates_30d.no_show)}</p><p className="text-xs text-ink-muted">absences</p></div>
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              {d.rates_30d.reliable ? `Calculé sur ${d.rates_30d.sample_size} parcours démarrés.` :
                `Seulement ${d.rates_30d.sample_size} parcours démarrés : ces taux sont indicatifs, pas encore significatifs.`}
              {" "}<Link href="/app/parcours" className="underline">Détail par question</Link>
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = <Kpi label={label} value={value} />;
  return href ? <Link href={href} className="block rounded-card"><Card className="h-full transition-colors hover:border-ink/40">{body}</Card></Link> : <Card className="h-full">{body}</Card>;
}
