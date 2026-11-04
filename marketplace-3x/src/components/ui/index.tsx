import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

// ───────────── Boutons ─────────────
type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent" | "dark";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong shadow-sm",
  accent: "bg-[var(--accent,var(--brand))] text-white hover:brightness-95 shadow-sm",
  dark: "bg-ink text-white hover:bg-black",
  secondary: "bg-white text-ink border border-line hover:border-ink-3",
  ghost: "text-ink-2 hover:bg-black/5",
  danger: "bg-white text-danger border border-danger/30 hover:bg-danger/5",
};
const sizes = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" };

export function buttonClass(variant: Variant = "primary", size: keyof typeof sizes = "md", className?: string) {
  return cn("inline-flex items-center justify-center gap-2 rounded-full font-medium transition disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap", variants[variant], sizes[size], className);
}
export function Button({ variant, size, className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <button className={buttonClass(variant, size, className)} {...p} />;
}
export function ButtonLink({ variant, size, className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <Link className={buttonClass(variant, size, className)} {...p} />;
}

// ───────────── Cartes & structure ─────────────
export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("rounded-[var(--radius)] border border-line bg-surface", className)} {...p} />;
}
export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div><h2 className="text-base font-semibold">{title}</h2>{subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}</div>
      {action}
    </div>
  );
}
export function PageHeader({ title, subtitle, action, eyebrow }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--accent,var(--brand))]">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-ink-2">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}
export function Container({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 md:px-6", className)} {...p} />;
}

// ───────────── Badges ─────────────
type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand" | "pro" | "supplier";
const tones: Record<Tone, string> = {
  neutral: "bg-black/5 text-ink-2", success: "bg-success/10 text-success", warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger", info: "bg-info/10 text-info", brand: "bg-brand-soft text-brand-strong",
  pro: "bg-pro/10 text-pro", supplier: "bg-supplier/10 text-supplier",
};
export function Badge({ tone = "neutral", className, ...p }: ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)} {...p} />;
}

// ───────────── Formulaires ─────────────
const fieldBase = "w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink placeholder:text-ink-3 transition focus:border-[var(--accent,var(--brand))] focus:outline-none focus:ring-4 focus:ring-[color-mix(in_srgb,var(--accent,var(--brand))_15%,transparent)]";
export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-11", className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-28 py-3", className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cn(fieldBase, "h-11 pr-8", className)} {...p} />;
}
export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}
export function Checkbox({ label, className, ...p }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-sm text-ink-2", className)}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded accent-[var(--accent,var(--brand))]" {...p} />
      <span>{label}</span>
    </label>
  );
}

// ───────────── Indicateurs ─────────────
export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-sm text-ink-3"><span>{label}</span>{icon}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </Card>
  );
}
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{children}</div>;
}

// ───────────── États ─────────────
export function EmptyState({ title, text, action, icon }: { title: string; text?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-line bg-white px-6 py-12 text-center">
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <p className="font-medium">{title}</p>
      {text && <p className="mt-1 max-w-md text-sm text-ink-3">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function Alert({ tone = "info", title, children }: { tone?: "info" | "success" | "warning" | "danger"; title?: string; children?: ReactNode }) {
  const t = { info: "border-info/20 bg-info/5", success: "border-success/20 bg-success/5", warning: "border-warning/25 bg-warning/5", danger: "border-danger/20 bg-danger/5" }[tone];
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm", t)} role={tone === "danger" ? "alert" : "status"}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className="text-ink-2">{children}</div>}
    </div>
  );
}

// ───────────── Tableaux ─────────────
export function Table({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">{children}</table></div>;
}
export function Th({ className, ...p }: ComponentProps<"th">) {
  return <th className={cn("border-b border-line bg-canvas/60 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-3", className)} {...p} />;
}
export function Td({ className, ...p }: ComponentProps<"td">) {
  return <td className={cn("border-b border-line px-4 py-3 align-middle", className)} {...p} />;
}

export function Tabs({ items, current }: { items: { href: string; label: string; count?: number }[]; current: string }) {
  return (
    <div className="scrollbar-none mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={cn("whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition",
          current === i.href ? "border-[var(--accent,var(--brand))] text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
          {i.label}{i.count != null && <span className="ml-1.5 rounded-full bg-black/5 px-1.5 text-xs">{i.count}</span>}
        </Link>
      ))}
    </div>
  );
}

export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 55% 52%)` }} aria-hidden="true">{initials}</span>
  );
}

export function Stars({ value, count }: { value: number; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm" aria-label={`Note ${value.toFixed(1)} sur 5`}>
      <span className="text-amber-500">{"★".repeat(Math.round(value))}<span className="text-black/15">{"★".repeat(5 - Math.round(value))}</span></span>
      {count != null && <span className="text-ink-3">({count})</span>}
    </span>
  );
}
