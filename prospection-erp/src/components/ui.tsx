import type { ReactNode } from 'react';
import type { NiveauConfiance } from '../lib/scoring';

export function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card !p-3">
      <div className="text-xs font-semibold muted">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-0.5">{value}</div>
      {hint && <div className="text-xs muted mt-0.5">{hint}</div>}
    </div>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-base font-bold m-0">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

const couleurPriorite: Record<string, string> = { A: '#15803d', B: '#1d4ed8', C: '#b45309', D: '#6b7280' };

export function ScoreBadge({ total, priorite, confiance }: { total: number; priorite: string; confiance: NiveauConfiance }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="badge text-white" style={{ background: couleurPriorite[priorite] }}>{priorite}</span>
      <b className="tabular-nums">{total}</b><span className="muted text-xs">/100</span>
      <span className="text-xs muted">· confiance {confiance}</span>
    </span>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([k, l]) => (
        <button key={k} type="button" className="chip" aria-pressed={value.includes(k)}
          onClick={() => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k])}>{l}</button>
      ))}
    </div>
  );
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="label">{label}</span>{children}</label>;
}

export function Barre({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-1.5 rounded-full bg-[var(--color-line)] overflow-hidden w-full">
      <div className="h-full bg-[var(--color-accent)]" style={{ width: `${max ? Math.min(100, (100 * value) / max) : 0}%` }} />
    </div>
  );
}

export function telecharger(nom: string, contenu: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Groupe de puces (pas de <label> : il « cliquerait » sur la première puce). */
export function Groupe({ label, children }: { label: string; children: ReactNode }) {
  return <div role="group" aria-label={label}><span className="label">{label}</span>{children}</div>;
}
