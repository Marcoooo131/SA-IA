import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ChevronLeft, Info, X } from 'lucide-react';
import { back } from '../lib/router';
import { parseNum } from '../lib/format';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 font-semibold shadow-[0_0_24px_-8px_var(--color-accent)]',
  secondary: 'bg-surface-2 text-ink hover:bg-surface-3 border border-line',
  ghost: 'text-muted hover:text-ink hover:bg-surface-2',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25 border border-danger/30',
  outline: 'border border-accent/50 text-accent hover:bg-accent/10',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  icon,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode }) {
  const sizes = { sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg', md: 'h-10 px-4 text-sm gap-2 rounded-xl', lg: 'h-12 px-5 text-base gap-2 rounded-2xl' };
  return (
    <button
      type="button"
      {...rest}
      className={cx('inline-flex items-center justify-center whitespace-nowrap transition active:scale-[.97] disabled:opacity-40 disabled:pointer-events-none select-none', sizes[size], VARIANTS[variant], className)}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx('inline-grid place-items-center size-9 rounded-xl text-muted hover:text-ink hover:bg-surface-2 transition active:scale-95 disabled:opacity-40', className)}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cx('card block w-full text-left p-4 transition hover:border-faint active:scale-[.99]', className)}>
        {children}
      </button>
    );
  return <div className={cx('card p-4', className)}>{children}</div>;
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center justify-between gap-3 mb-3', className)}>
      <h2 className="display text-lg font-bold uppercase tracking-wide text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, backTo, action }: { title: ReactNode; subtitle?: ReactNode; backTo?: string; action?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 mb-5">
      <div className="flex items-start gap-2 min-w-0">
        {backTo !== undefined && (
          <IconButton label="Retour" onClick={() => back(backTo)} className="-ml-2 mt-0.5">
            <ChevronLeft size={22} />
          </IconButton>
        )}
        <div className="min-w-0">
          <h1 className="display text-3xl font-bold uppercase leading-none tracking-wide truncate">{title}</h1>
          {subtitle && <p className="text-sm text-muted mt-1.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0 flex items-center gap-1">{action}</div>}
    </header>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'info'; className?: string }) {
  const t = {
    neutral: 'bg-surface-3 text-muted',
    accent: 'bg-accent/15 text-accent',
    warn: 'bg-warn/15 text-warn',
    danger: 'bg-danger/15 text-danger',
    info: 'bg-info/15 text-info',
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', t, className)}>{children}</span>;
}

/** Jauge circulaire (anneau) */
export function Ring({
  value,
  max,
  size = 120,
  stroke = 10,
  color = 'var(--color-accent)',
  children,
  label,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = max > 0 ? Math.max(0, value / max) : 0;
  const over = ratio > 1;
  const dash = Math.min(1, ratio) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(ratio * 100)} %`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-surface-3)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={over ? 'var(--color-warn)' : color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: 'stroke-dasharray .6s cubic-bezier(.2,.9,.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, max, color = 'var(--color-accent)', className, height = 8 }: { value: number; max: number; color?: string; className?: string; height?: number }) {
  const ratio = max > 0 ? Math.max(0, value / max) : 0;
  return (
    <div className={cx('w-full rounded-full bg-surface-3 overflow-hidden', className)} style={{ height }} role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, ratio * 100)}%`, background: ratio > 1.05 ? 'var(--color-warn)' : color, transition: 'width .5s cubic-bezier(.2,.9,.3,1)' }} />
    </div>
  );
}

export function MacroBar({ label, value, target, unit = 'g', color }: { label: string; value: number; target: number; unit?: string; color: string }) {
  const rem = target - value;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm mb-1.5">
        <span className="flex items-center gap-2 text-muted">
          <span className="size-2 rounded-full" style={{ background: color }} />
          {label}
        </span>
        <span className="tnum">
          <span className="font-semibold text-ink">{Math.round(value)}</span>
          <span className="text-muted"> / {Math.round(target)} {unit}</span>
        </span>
      </div>
      <ProgressBar value={value} max={target} color={color} height={6} />
      <div className="text-[11px] text-faint mt-1 tnum">{rem >= 0 ? `Reste ${Math.round(rem)} ${unit}` : `+${Math.round(-rem)} ${unit} au-dessus`}</div>
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      <div className="text-[11px] uppercase tracking-wider text-muted font-medium truncate">{label}</div>
      <div className="display text-2xl font-bold tnum leading-tight mt-0.5 truncate">{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card p-8 text-center flex flex-col items-center gap-3">
      {icon && <div className="size-12 rounded-2xl bg-surface-2 grid place-items-center text-accent">{icon}</div>}
      <div className="font-semibold">{title}</div>
      {text && <p className="text-sm text-muted max-w-sm">{text}</p>}
      {action}
    </div>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div className={cx('flex gap-2.5 rounded-xl p-3 text-xs leading-relaxed', tone === 'warn' ? 'bg-warn/10 text-warn' : 'bg-surface-2 text-muted')}>
      <Info size={15} className="shrink-0 mt-px" />
      <div>{children}</div>
    </div>
  );
}

/** Feuille modale : en bas de l'écran sur mobile, centrée sur ordinateur */
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div ref={ref} className={cx('relative w-full bg-surface border border-line rounded-t-3xl sm:rounded-3xl max-h-[92dvh] flex flex-col anim-sheet-up sm:anim-pop', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-line">
          <h3 className="display text-xl font-bold uppercase tracking-wide truncate">{title}</h3>
          <IconButton label="Fermer" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-4 flex-1">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line flex gap-2 justify-end safe-bottom">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-faint mt-1">{hint}</span>}
    </label>
  );
}

/**
 * Saisie numérique tolérante (virgule ou point) : la valeur affichée reste libre pendant la saisie,
 * la valeur transmise est un nombre ou null.
 */
export function NumberInput({
  value,
  onChange,
  placeholder,
  className,
  min,
  max,
  step,
  inputMode = 'decimal',
  ariaLabel,
  suffix,
  onEnter,
}: {
  value: number | null | undefined;
  onChange: (n: number | null) => void;
  placeholder?: string;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  inputMode?: 'decimal' | 'numeric';
  ariaLabel?: string;
  suffix?: string;
  onEnter?: () => void;
}) {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value).replace('.', ','));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      const parsed = parseNum(text);
      if (parsed !== value) setText(value === null || value === undefined ? '' : String(value).replace('.', ','));
    }
  }, [value, text]);
  return (
    <div className={cx('relative', className)}>
      <input
        className={cx('field tnum', suffix && 'pr-10')}
        inputMode={inputMode}
        value={text}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,-]/g, '');
          setText(t);
          let n = parseNum(t);
          if (n !== null && min !== undefined && n < min) n = min;
          if (n !== null && max !== undefined && n > max) n = max;
          if (n !== null && step === 1) n = Math.round(n);
          last.current = n;
          onChange(n);
        }}
      />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint pointer-events-none">{suffix}</span>}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, className, size = 'md' }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cx('inline-flex p-1 rounded-xl bg-surface-2 border border-line gap-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx('flex-1 rounded-lg font-medium transition whitespace-nowrap', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm', o.value === value ? 'bg-surface-3 text-ink shadow' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Onglets de sous-navigation défilants (liens) */
export function SubNav({ items, active }: { items: { to: string; label: string }[]; active: string }) {
  return (
    <nav className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 mb-5" aria-label="Sous-navigation">
      {items.map((i) => (
        <a
          key={i.to}
          href={`#${i.to}`}
          aria-current={i.to === active ? 'page' : undefined}
          className={cx('shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium border transition', i.to === active ? 'bg-accent text-accent-ink border-accent' : 'border-line text-muted hover:text-ink bg-surface')}
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cx('shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition', active ? 'bg-accent/15 text-accent border-accent/40' : 'border-line text-muted hover:text-ink')}>
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <label htmlFor={id} className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative shrink-0 w-11 h-6 rounded-full transition', checked ? 'bg-accent' : 'bg-surface-3')}
      >
        <span className={cx('absolute top-0.5 size-5 rounded-full bg-white transition', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </div>
  );
}

export function Delta({ value, unit = '', digits = 1, invert, className }: { value: number | null; unit?: string; digits?: number; invert?: boolean; className?: string }) {
  if (value === null || !Number.isFinite(value)) return <span className={cx('text-faint', className)}>—</span>;
  const r = Number(value.toFixed(digits));
  const good = invert ? r < 0 : r > 0;
  const color = r === 0 ? 'text-muted' : good ? 'text-accent' : 'text-warn';
  return (
    <span className={cx('tnum font-semibold', color, className)}>
      {r > 0 ? '+' : r < 0 ? '−' : '±'}
      {Math.abs(r).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}
      {unit && ` ${unit}`}
    </span>
  );
}
