import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { X } from 'lucide-react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 border-brand-700',
  secondary: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent',
  danger: 'bg-white text-red-700 hover:bg-red-50 border-red-200',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: ReactNode }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconButton({ label, active, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cx(
        'inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors disabled:opacity-40',
        active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-transparent text-slate-600 hover:bg-slate-100',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children, className, required }: { label: string; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cx('flex flex-col gap-1', className)}>
      <span className="text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 shadow-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(inputCls, 'pr-7', className)}>
      {children}
    </select>
  );
}

/**
 * Champ numérique avec saisie libre (virgule acceptée) : la valeur n'est
 * transmise qu'une fois valide, la saisie en cours n'est pas perturbée.
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 0.1,
  allowNull = false,
  suffix,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'step'> & {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  allowNull?: boolean;
  suffix?: string;
}) {
  const fmt = (v: number | null) => (v === null || v === undefined ? '' : String(Math.round(v * 1000) / 1000).replace('.', ','));
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(fmt(value));
  }, [value, focused]);
  const invalid = (() => {
    if (text.trim() === '') return !allowNull;
    const n = Number(text.replace(',', '.').replace(/\s/g, ''));
    return !Number.isFinite(n) || (min !== undefined && n < min) || (max !== undefined && n > max);
  })();
  return (
    <div className={cx('relative', className)}>
      <input
        {...rest}
        inputMode="decimal"
        value={text}
        aria-invalid={invalid}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setText(fmt(value));
        }}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (t.trim() === '') {
            if (allowNull) onChange(null);
            return;
          }
          const n = Number(t.replace(',', '.').replace(/\s/g, ''));
          if (!Number.isFinite(n)) return;
          if (min !== undefined && n < min) return;
          if (max !== undefined && n > max) return;
          onChange(n);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const cur = value ?? 0;
            let n = Math.round((cur + (e.key === 'ArrowUp' ? step : -step)) * 1000) / 1000;
            if (min !== undefined) n = Math.max(min, n);
            if (max !== undefined) n = Math.min(max, n);
            onChange(n);
            setText(fmt(n));
          }
          rest.onKeyDown?.(e);
        }}
        className={cx(inputCls, suffix && 'pr-9', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-100')}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('flex cursor-pointer items-center gap-2 text-sm', disabled && 'opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-slate-300')}
      >
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-4.5' : 'left-0.5')} />
      </button>
      <span className="text-slate-700">{label}</span>
    </label>
  );
}

type Tone = 'slate' | 'blue' | 'amber' | 'red' | 'green' | 'violet' | 'teal';
const TONES: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200',
};
export function Badge({ tone = 'slate', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap', TONES[tone], className)}>{children}</span>;
}

export function Card({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx('rounded-lg border border-slate-200 bg-white shadow-xs', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <div className="flex items-center gap-1.5">{actions}</div>
        </header>
      )}
      <div className={cx('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function PanelSection({ title, children, actions, className }: { title: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx('border-b border-slate-200 px-3 py-3', className)}>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{title}</h4>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={cx('flex max-h-[92vh] w-full flex-col rounded-xl bg-white shadow-2xl', wide ? 'max-w-6xl' : 'max-w-xl')}>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <IconButton label="Fermer" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </header>
        <div className="scroll-thin flex-1 overflow-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-slate-500">
      {icon}
      <p className="font-medium text-slate-700">{title}</p>
      {children && <div className="max-w-md text-sm">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'brand' | 'default' }) {
  return (
    <div className={cx('rounded-lg px-3 py-2', tone === 'brand' ? 'bg-brand-700 text-white' : 'bg-slate-50')}>
      <div className={cx('text-[11px] uppercase tracking-wide', tone === 'brand' ? 'text-brand-100' : 'text-slate-500')}>{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className={cx('text-[11px]', tone === 'brand' ? 'text-brand-100' : 'text-slate-500')}>{sub}</div>}
    </div>
  );
}
