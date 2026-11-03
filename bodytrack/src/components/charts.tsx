import type { ReactNode } from 'react';

/**
 * Palette catégorielle des graphiques (ordre fixe, jamais recyclé), validée pour le thème sombre
 * (bande de luminosité, séparation daltonisme ΔE ≥ 6,5, contraste ≥ 3:1 sur la surface #131518).
 * Les séries uniques utilisent la couleur d'accent de la marque.
 */
export const SERIES = ['#1bab5c', '#3f80dc', '#bf830a', '#a065dc'] as const;
export const ACCENT = '#2efc86';
export const GRID = '#24282d';
export const AXIS = '#5b626b';

export const axisProps = {
  stroke: AXIS,
  tick: { fill: '#8b929c', fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = { stroke: GRID, strokeDasharray: '0', vertical: false } as const;

interface TooltipPayload {
  name?: string;
  value?: number | string | (number | string)[];
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

/** Info-bulle commune : texte en encre neutre, pastille de couleur pour l'identité */
export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
  labelFormatter?: (l: string | number, p?: Record<string, unknown>) => ReactNode;
  valueFormatter?: (v: number, name: string, p?: Record<string, unknown>) => ReactNode;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value !== null && p.value !== undefined && p.name !== '_band');
  return (
    <div className="rounded-xl border border-line bg-surface-2/95 backdrop-blur px-3 py-2 text-xs shadow-xl min-w-32">
      <div className="text-muted mb-1">{labelFormatter ? labelFormatter(label ?? '', payload[0]?.payload) : label}</div>
      {rows.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-3 tnum">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="text-ink font-semibold">
            {Array.isArray(p.value)
              ? p.value.map((v) => (typeof v === 'number' ? v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : v)).join(' – ')
              : valueFormatter && typeof p.value === 'number'
                ? valueFormatter(p.value, p.name ?? '', p.payload)
                : typeof p.value === 'number'
                  ? p.value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
                  : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted mb-2">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block w-3.5 h-0.5 rounded" style={{ background: i.dashed ? `repeating-linear-gradient(90deg, ${i.color} 0 3px, transparent 3px 5px)` : i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Vue tableau dépliable : accessibilité et lecture précise des valeurs */
export function DataTable({ columns, rows, summary = 'Voir les données' }: { columns: string[]; rows: (string | number)[][]; summary?: string }) {
  if (!rows.length) return null;
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-faint hover:text-muted select-none">{summary}</summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-line">
        <table className="w-full tnum">
          <thead className="bg-surface-2 text-muted sticky top-0">
            <tr>
              {columns.map((c) => (
                <th key={c} className="text-left font-medium px-2 py-1.5">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {r.map((v, j) => (
                  <td key={j} className="px-2 py-1">
                    {typeof v === 'number' ? v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
