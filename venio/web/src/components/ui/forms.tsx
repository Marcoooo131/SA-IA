import { Check } from "lucide-react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

export function Field({ label, hint, error, optional, children, className }:
  { label: string; hint?: string; error?: string; optional?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block space-y-1.5", className)}>
      <span className="text-sm font-medium text-ink">
        {label}{optional && <span className="font-normal text-ink-subtle"> (facultatif)</span>}
      </span>
      {children}
      {hint && !error && <span className="block text-xs text-ink-muted">{hint}</span>}
      {error && <span role="alert" className="block text-xs font-medium text-danger">{error}</span>}
    </label>
  );
}

export const controlClass = (invalid?: boolean) => cx(
  "w-full rounded-control border bg-surface px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-subtle",
  "outline-none transition-colors duration-150 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-subtle",
  invalid ? "border-danger focus:ring-2 focus:ring-danger/20"
    : "border-line-strong hover:border-ink/40 focus:border-ink focus:ring-2 focus:ring-ink/10",
);

type Invalid = { invalid?: boolean };

export function Input({ invalid, className, ...p }: InputHTMLAttributes<HTMLInputElement> & Invalid) {
  return <input {...p} aria-invalid={invalid || undefined} className={cx(controlClass(invalid), className)} />;
}

export function Textarea({ invalid, className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & Invalid) {
  return <textarea {...p} aria-invalid={invalid || undefined} className={cx(controlClass(invalid), "min-h-24", className)} />;
}

export function Select({ invalid, className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & Invalid) {
  return (
    <select {...p} aria-invalid={invalid || undefined}
      className={cx(controlClass(invalid), "appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234a5468' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", ...p.style }}>
      {children}
    </select>
  );
}

/** Case à cocher accessible (vraie <input>, style personnalisé). */
export function Checkbox({ label, description, className, ...p }:
  Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-3 text-sm", p.disabled && "cursor-not-allowed opacity-60", className)}>
      <span className="relative mt-0.5 grid h-5 w-5 shrink-0 place-items-center">
        <input type="checkbox" {...p} className="peer absolute inset-0 cursor-[inherit] appearance-none rounded-[4px] border border-line-strong bg-surface transition-colors checked:border-[var(--check,var(--color-ink))] checked:bg-[var(--check,var(--color-ink))] focus-visible:outline-2" />
        <Check aria-hidden className="pointer-events-none relative h-3.5 w-3.5 text-[var(--brand-fg)] opacity-0 peer-checked:opacity-100" strokeWidth={3} />
      </span>
      <span>
        <span className="text-ink">{label}</span>
        {description && <span className="block text-ink-muted">{description}</span>}
      </span>
    </label>
  );
}

/** Interrupteur (activation d'une fonction). */
export function Switch({ checked, onChange, label, description, disabled }:
  { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <label className={cx("flex cursor-pointer items-start justify-between gap-4", disabled && "cursor-not-allowed opacity-60")}>
      <span className="text-sm">
        <span className="font-medium text-ink">{label}</span>
        {description && <span className="block text-ink-muted">{description}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150", checked ? "bg-ink" : "bg-line-strong")}>
        <span className={cx("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150", checked && "translate-x-5")} />
      </button>
    </label>
  );
}

/** Choix en tuile (parcours client : une décision par écran). */
export function ChoiceTile({ selected, title, description, icon, className, ...p }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; title: ReactNode; description?: ReactNode; icon?: ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} {...p}
      className={cx("flex min-h-20 w-full flex-col items-start justify-between gap-2 rounded-card border bg-surface p-3.5 text-left transition-[border-color,box-shadow] duration-150",
        selected ? "border-[var(--brand)] ring-1 ring-[var(--brand)]" : "border-line hover:border-[var(--brand)]", className)}>
      {icon && <span aria-hidden className="leading-none">{icon}</span>}
      <span>
        <span className="block font-medium text-ink">{title}</span>
        {description && <span className="mt-0.5 block text-sm text-ink-muted">{description}</span>}
      </span>
    </button>
  );
}
