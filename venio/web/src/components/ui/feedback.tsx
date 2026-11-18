"use client";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./actions";
import { cx } from "./cx";

type Kind = "error" | "info" | "success" | "warning";
const KIND: Record<Kind, { box: string; Icon: typeof Info }> = {
  error: { box: "bg-danger-soft text-danger border-danger/20", Icon: XCircle },
  warning: { box: "bg-warning-soft text-warning border-warning/20", Icon: AlertTriangle },
  success: { box: "bg-success-soft text-success border-success/20", Icon: CheckCircle2 },
  info: { box: "bg-info-soft text-info border-info/20", Icon: Info },
};

/** Message dans la page (erreur de formulaire, confirmation, information). */
export function Alert({ kind = "error", title, children, className }:
  { kind?: Kind; title?: ReactNode; children: ReactNode; className?: string }) {
  const { box, Icon } = KIND[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cx("flex gap-2.5 rounded-control border px-3 py-2.5 text-sm", box, className)}>
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 [&_a]:underline">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-0.5" : undefined}>{children}</div>
      </div>
    </div>
  );
}

export type BadgeTone = "neutral" | "accent" | "good" | "bad" | "warning" | "info";
const TONE: Record<BadgeTone, string> = {
  neutral: "bg-sunken text-ink-muted",
  accent: "bg-signal-soft text-signal-strong",
  good: "bg-success-soft text-success",
  bad: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
};

export function Badge({ tone = "neutral", dot, children }: { tone?: BadgeTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONE[tone])}>
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}{children}
    </span>
  );
}

/** Zone vide : dit ce qui manque et propose l'action suivante. */
export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line-strong px-6 py-10 text-center">
      {icon && <span aria-hidden className="mb-3 text-ink-subtle">{icon}</span>}
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-ink-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Squelette de chargement (évite les sauts de mise en page). */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx("block animate-pulse rounded-control bg-sunken motion-reduce:animate-none", className)} />;
}

// ----------------------------------------------------------------------------- notifications éphémères

type Toast = { id: number; kind: Kind; text: string };
const ToastContext = createContext<(text: string, kind?: Kind) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Kind = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => {
          const { Icon } = KIND[t.kind];
          return (
            <div key={t.id} role="status" className="fade-in pointer-events-auto flex items-center gap-2 rounded-card bg-ink px-4 py-2.5 text-sm text-white shadow-float">
              <Icon aria-hidden className={cx("h-4 w-4", t.kind === "error" ? "text-[#ff9b8f]" : "text-signal")} />{t.text}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// ----------------------------------------------------------------------------- fenêtres modales

/** Modale basée sur <dialog> : focus piégé, Échap et fond gérés par le navigateur. */
export function Modal({ open, onClose, title, children, footer, size = "md" }:
  { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-label={title}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={cx("m-auto w-[calc(100%-2rem)] rounded-card border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-ink/40",
        { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" }[size])}>
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Fermer" className="-m-1 rounded-control p-1 text-ink-muted hover:bg-sunken hover:text-ink"><X className="h-4 w-4" /></button>
      </div>
      <div className="px-5 py-4 text-sm">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
    </dialog>
  );
}

/** Confirmation d'une action destructive : le bouton dit exactement ce qui va se passer. */
export function ConfirmDialog({ open, onCancel, onConfirm, title, children, confirmLabel, busy }:
  { open: boolean; onCancel: () => void; onConfirm: () => void; title: string; children: ReactNode; confirmLabel: string; busy?: boolean }) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm"
      footer={<><Button variant="secondary" onClick={onCancel}>Annuler</Button><Button variant="danger" loading={busy} onClick={onConfirm}>{confirmLabel}</Button></>}>
      {children}
    </Modal>
  );
}
