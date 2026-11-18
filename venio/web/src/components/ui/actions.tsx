import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent" | "brand";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-ink/90 active:bg-ink",
  secondary: "bg-surface text-ink border border-line-strong hover:border-ink/50 hover:bg-sunken/60",
  ghost: "text-ink-muted hover:bg-sunken hover:text-ink",
  danger: "bg-surface text-danger border border-danger/30 hover:bg-danger-soft",
  // Accent : orange foncé avec texte blanc (6,0:1). L'orange clair n'accepte que du texte ink.
  accent: "bg-signal-strong text-white hover:bg-signal-strong/90",
  // Couleur de l'entreprise cliente (pages de réservation) ; --brand-fg garantit le contraste.
  brand: "bg-[var(--brand)] text-[var(--brand-fg)] hover:opacity-90",
};
const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

export const buttonClass = (variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) =>
  cx("inline-flex select-none items-center justify-center rounded-control font-medium transition-colors duration-150",
    "disabled:cursor-not-allowed disabled:opacity-50", VARIANTS[variant], SIZES[size], className);

export function Button({ variant = "primary", size = "md", className, loading, icon, children, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; icon?: ReactNode }) {
  return (
    <button {...p} disabled={p.disabled || loading} aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}>
      {loading ? <Spinner /> : icon}{children}
    </button>
  );
}

/** Lien présenté comme un bouton (navigation). */
export function ButtonLink({ variant = "primary", size = "md", className, children, ...p }:
  AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <a {...p} className={buttonClass(variant, size, className)}>{children}</a>;
}

export function IconButton({ label, className, children, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...p}
      className={cx("inline-grid h-9 w-9 place-items-center rounded-control text-ink-muted transition-colors hover:bg-sunken hover:text-ink disabled:opacity-50", className)}>
      {children}
    </button>
  );
}

export function TextLink({ className, ...p }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...p} className={cx("font-medium text-signal-strong underline decoration-signal-strong/30 underline-offset-2 hover:decoration-signal-strong", className)} />;
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role={label ? "status" : undefined} className="inline-flex items-center gap-2">
      <span aria-hidden className={cx("h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none", className)} />
      {label && <span className="text-sm text-ink-muted">{label}</span>}
    </span>
  );
}
