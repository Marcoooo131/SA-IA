import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Button({ variant = "primary", className, loading, children, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean }) {
  const styles = {
    primary: "bg-ink text-white hover:bg-ink-soft",
    secondary: "bg-white text-ink border border-line hover:border-ink/40",
    ghost: "text-ink-soft hover:bg-ink/5",
    danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
  }[variant];
  return (
    <button {...p} disabled={p.disabled || loading}
      className={cx("inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed", styles, className)}>
      {loading && <Spinner />}{children}
    </button>
  );
}

export function Spinner() {
  return <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-xl border border-line bg-white p-5", className)}>{children}</div>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-ink-soft">{hint}</span>}
      {error && <span className="block text-xs text-red-700">{error}</span>}
    </label>
  );
}

const inputClass = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[15px] outline-none focus:border-ink/50";

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(inputClass, p.className)} />;
}
export function Textarea(p: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(inputClass, "min-h-24", p.className)} />;
}

export function Alert({ kind = "error", children }: { kind?: "error" | "info" | "success"; children: ReactNode }) {
  const styles = { error: "bg-red-50 text-red-800 border-red-200", info: "bg-sky-50 text-sky-900 border-sky-200", success: "bg-emerald-50 text-emerald-900 border-emerald-200" }[kind];
  return <div role={kind === "error" ? "alert" : "status"} className={cx("rounded-lg border px-3 py-2.5 text-sm", styles)}>{children}</div>;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "accent" | "good" | "bad"; children: ReactNode }) {
  const styles = { neutral: "bg-ink/5 text-ink-soft", accent: "bg-accent/15 text-accent-dark", good: "bg-emerald-50 text-emerald-800", bad: "bg-red-50 text-red-700" }[tone];
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", styles)}>{children}</span>;
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-accent">◆</span>Venio
    </span>
  );
}

export { cx };
