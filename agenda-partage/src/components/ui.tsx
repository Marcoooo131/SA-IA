import { Loader2, Lock, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { STATUS_META } from '../lib/status';
import type { AppointmentStatus, Profile } from '../lib/types';

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <Loader2 className={`animate-spin text-brand ${className}`} aria-label="Chargement" />;
}

export function StatusBadge({ status, className = '' }: { status: AppointmentStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${meta.badge} ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

export function PrivateBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-white">
      <Lock className="h-3 w-3" /> Confidentiel
    </span>
  );
}

export function initials(name: string): string {
  return (
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]!.toUpperCase())
      .join('') || '?'
  );
}

export function Avatar({ profile, size = 'md' }: { profile: Pick<Profile, 'full_name' | 'email' | 'color'> | null | undefined; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'h-6 w-6 text-[10px]' : size === 'lg' ? 'h-12 w-12 text-base' : 'h-8 w-8 text-xs';
  const name = profile?.full_name || profile?.email || '?';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-white ${dim}`}
      style={{ background: profile?.color ?? '#9ca3af' }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

export function displayName(p: Pick<Profile, 'full_name' | 'email'> | null | undefined, fallback = '—'): string {
  if (!p) return fallback;
  return p.full_name || p.email;
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">{icon}</div>
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-neutral-500">{children}</div>}
    </div>
  );
}

/**
 * Fenêtre modale : panneau plein écran glissant depuis le bas sur téléphone,
 * fenêtre centrée sur ordinateur. Échap et clic à l'extérieur ferment.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'lg',
  variant = 'center',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'center' | 'drawer';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;
  const width = { sm: 'md:max-w-md', md: 'md:max-w-lg', lg: 'md:max-w-2xl', xl: 'md:max-w-4xl' }[size];
  const isDrawer = variant === 'drawer';

  return (
    <div
      className={`animate-fade fixed inset-0 z-50 flex bg-black/50 backdrop-blur-[2px] ${
        isDrawer ? 'items-end md:items-stretch md:justify-end' : 'items-end md:items-center md:justify-center md:p-6'
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[94dvh] w-full flex-col bg-white shadow-2xl outline-none ${
          isDrawer
            ? `animate-sheet rounded-t-2xl md:animate-drawer md:max-h-none md:h-full md:max-w-xl md:rounded-none`
            : `animate-sheet rounded-t-2xl md:rounded-2xl ${width}`
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-neutral-300 md:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3 md:px-6 md:py-4">
          <div className="min-w-0 flex-1 text-lg font-bold text-ink">{title}</div>
          <button onClick={onClose} className="btn-icon -mr-2 shrink-0" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-6">{children}</div>
        {footer && <div className="safe-bottom border-t border-neutral-200 bg-neutral-50 px-4 py-3 md:rounded-b-2xl md:px-6">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            Annuler
          </button>
          <button className={danger ? 'btn-primary' : 'btn-dark'} onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="text-sm text-neutral-700">{message}</div>
    </Modal>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${checked ? 'bg-brand' : 'bg-neutral-300'}`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
      <span className="text-sm">
        <span className="font-medium text-ink">{label}</span>
        {description && <span className="block text-neutral-500">{description}</span>}
      </span>
    </label>
  );
}
