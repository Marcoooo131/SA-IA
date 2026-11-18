"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMe } from "@/components/AppShell";
import { Alert, Badge, Card, Input, Spinner, cx } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { CASE_STATUS, fmtDate, fmtDateTime } from "@/lib/format";
import { caseFilePath } from "@/lib/routes";

type CaseRow = { id: string; created_at: string; status: string; summary: string; completeness: number; first_name: string; last_name: string | null; email: string; phone: string | null; service_name: string; next_booking: string | null };

const FILTERS = [["", "Toutes"], ["new", "Nouvelles"], ["to_process", "À traiter"], ["to_recontact", "À recontacter"], ["done", "Terminées"], ["cancelled", "Annulées"]] as const;

export default function CasesPage() {
  const me = useMe();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CaseRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("status");
    if (s) setStatus(s);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      api<CaseRow[]>(`/case-files?${params}`).then(setRows).catch((e) => setError(errorMessage(e)));
    }, 200);
    return () => clearTimeout(t);
  }, [status, q]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Demandes</h1>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([v, l]) => (
          <button key={v} onClick={() => setStatus(v)} className={cx("rounded-full px-3 py-1.5 text-sm", status === v ? "bg-ink text-white" : "bg-surface hover:bg-ink/5")}>{l}</button>
        ))}
        <Input placeholder="Rechercher (nom, email, téléphone, projet)" value={q} onChange={(e) => setQ(e.target.value)} className="ml-auto max-w-xs" />
      </div>
      {error && <Alert>{error}</Alert>}
      {!rows ? <Spinner /> : rows.length === 0 ? <Card><p className="text-sm text-ink-muted">Aucune demande pour ce filtre.</p></Card> : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={caseFilePath(r.id)} className="grid gap-1 px-5 py-3 hover:bg-ink/[0.02] md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="font-medium">{r.first_name} {r.last_name} <span className="text-sm font-normal text-ink-muted">· {r.service_name}</span></p>
                    <p className="line-clamp-1 text-sm text-ink-muted">{r.summary}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-ink-muted">
                    {r.next_booking && <span className="first-letter:uppercase">RDV {fmtDateTime(r.next_booking, me.tenant.timezone)}</span>}
                    <span>reçue {fmtDate(r.created_at, me.tenant.timezone)}</span>
                    <Badge tone={r.status === "new" ? "accent" : r.status === "cancelled" || r.status === "no_show" ? "bad" : "neutral"}>{CASE_STATUS[r.status]}</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
