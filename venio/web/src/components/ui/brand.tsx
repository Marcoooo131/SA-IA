import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Symbole « le fil » : un signal (point orange) relié par une ligne continue à un rendez-vous (anneau).
 * Une seule épaisseur de trait, aucune couleur en dehors de ink et signal.
 */
export function LogoMark({ className, animated, inverted }: { className?: string; animated?: boolean; inverted?: boolean }) {
  const ink = inverted ? "#ffffff" : "var(--color-ink)";
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cx("h-7 w-7 shrink-0", className)} fill="none">
      <path d="M6.5 23.5C13.5 23.5 12 10 19.6 10" stroke={ink} strokeWidth="2.4" strokeLinecap="round" pathLength={1}
        className={animated ? "draw-thread" : undefined} />
      <circle cx="24.1" cy="10" r="4.5" stroke={ink} strokeWidth="2.4" />
      <circle cx="6.5" cy="23.5" r="3" fill="var(--color-signal)" />
    </svg>
  );
}

export function Logo({ className, inverted, animated }: { className?: string; inverted?: boolean; animated?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-[0.4em]", inverted ? "text-white" : "text-ink", className)}>
      <LogoMark inverted={inverted} animated={animated} className="h-[1.45em] w-[1.45em]" />
      <span className="font-display text-[1.35em] font-semibold leading-none tracking-tight">Venio</span>
    </span>
  );
}

/**
 * Progression d'un parcours sous forme de fil : les étapes franchies sont reliées par une ligne pleine.
 * Utilise la couleur de l'entreprise (--brand) sur les pages de réservation.
 */
export function ThreadProgress({ value, label = "Progression" }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="relative h-3">
      <span aria-hidden className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
      <span aria-hidden className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-[var(--brand)] transition-[width] duration-500 ease-out-soft motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      <span aria-hidden className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--brand)] bg-surface transition-[left] duration-500 ease-out-soft motion-reduce:transition-none" style={{ left: `${pct}%` }} />
    </div>
  );
}

/** Cadre de téléphone pour présenter une vraie page du produit (vitrine, démonstration). */
export function PhoneFrame({ children, className, label, size = "md" }: { children: ReactNode; className?: string; label?: string; size?: "sm" | "md" }) {
  const sm = size === "sm";
  return (
    <figure className={cx("mx-auto rounded-[2.2rem] border border-ink/15 bg-ink shadow-float", sm ? "w-[210px] p-2" : "w-[300px] p-2.5", className)}>
      <div className={cx("relative overflow-hidden bg-paper", sm ? "h-[420px] rounded-[1.6rem]" : "h-[560px] rounded-[1.7rem]")}>
        <span aria-hidden className={cx("absolute left-1/2 z-10 -translate-x-1/2 rounded-full bg-ink", sm ? "top-1.5 h-4 w-14" : "top-2 h-5 w-20")} />
        <div className={cx("h-full overflow-y-auto", sm ? "pt-7" : "pt-9")} tabIndex={0} role="region" aria-label={label ?? "Aperçu sur téléphone"}>{children}</div>
      </div>
      {label && <figcaption className="sr-only">{label}</figcaption>}
    </figure>
  );
}

/** Cadre de navigateur pour les captures de l'espace entreprise. */
export function BrowserFrame({ children, url, className }: { children: ReactNode; url?: string; className?: string }) {
  return (
    <figure className={cx("overflow-hidden rounded-frame border border-line bg-surface shadow-float", className)}>
      <div className="flex items-center gap-3 border-b border-line bg-sunken/60 px-4 py-2.5">
        <span aria-hidden className="flex gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-line-strong" /><i className="h-2.5 w-2.5 rounded-full bg-line-strong" /><i className="h-2.5 w-2.5 rounded-full bg-line-strong" /></span>
        {url && <span className="truncate rounded-control bg-surface px-3 py-1 font-mono text-xs text-ink-muted">{url}</span>}
      </div>
      <div>{children}</div>
    </figure>
  );
}

/** Bulle de SMS (aperçu d'un modèle, démonstration). */
export function SmsBubble({ sender, children, time }: { sender: string; children: ReactNode; time?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-center text-[11px] font-medium text-ink-subtle">{sender}{time && ` · ${time}`}</p>
      <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-sunken px-3.5 py-2.5 text-sm leading-snug text-ink">{children}</p>
    </div>
  );
}
