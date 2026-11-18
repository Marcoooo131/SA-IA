import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cx } from "./cx";

export function Card({ className, children, padded = true, ...p }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div {...p} className={cx("rounded-card border border-line bg-surface", padded && "p-5", className)}>{children}</div>;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Indicateur chiffré. La variation n'est affichée que si elle est calculée sur des données réelles. */
export function Kpi({ label, value, delta, hint }: { label: string; value: ReactNode; delta?: number | null; hint?: ReactNode }) {
  return (
    <div>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="tabular mt-1 text-3xl font-semibold tracking-tight text-ink">{value}</p>
      {delta != null && (
        <p className={cx("mt-1 inline-flex items-center gap-0.5 text-xs font-medium", delta >= 0 ? "text-success" : "text-danger")}>
          {delta >= 0 ? <ArrowUpRight aria-hidden className="h-3.5 w-3.5" /> : <ArrowDownRight aria-hidden className="h-3.5 w-3.5" />}
          {delta >= 0 ? "+" : ""}{delta} % <span className="font-normal text-ink-subtle">vs mois précédent</span>
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-ink-subtle">{hint}</p>}
    </div>
  );
}

export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("overflow-x-auto rounded-card border border-line bg-surface", className)}>
      <table className="tabular w-full text-left text-sm">{children}</table>
    </div>
  );
}
export function Th({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" {...p} className={cx("border-b border-line bg-sunken/50 px-4 py-2.5 text-xs font-medium tracking-wide text-ink-muted uppercase", className)} />;
}
export function Td({ className, ...p }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...p} className={cx("border-b border-line px-4 py-3 align-middle text-ink [tr:last-child>&]:border-b-0", className)} />;
}

export function Tabs<T extends string>({ value, onChange, items, label }:
  { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
      {items.map((it) => (
        <button key={it.value} role="tab" type="button" aria-selected={value === it.value} onClick={() => onChange(it.value)}
          className={cx("-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            value === it.value ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink")}>
          {it.label}{it.count != null && <span className="tabular rounded-full bg-sunken px-1.5 text-xs text-ink-muted">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <span aria-hidden className={cx("inline-grid shrink-0 place-items-center rounded-full bg-sunken font-medium text-ink-muted", size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm")}>
      {initials || "?"}
    </span>
  );
}
