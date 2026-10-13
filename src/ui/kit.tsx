import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { X } from 'lucide-react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'primary' | 'secondary' | 'dark' | 'ghost' | 'danger' | 'success';
const VARIANTS: Record<Variant, string> = {
  // Action principale : rouge
  primary: 'bg-brand-600 text-white hover:bg-brand-700 border-brand-600 shadow-sm',
  // Action secondaire : blanc, bordure discrète
  secondary: 'bg-white text-slate-800 hover:bg-slate-50 border-slate-300',
  // Action structurante : noir
  dark: 'bg-slate-900 text-white hover:bg-slate-800 border-slate-900',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent',
  danger: 'bg-white text-brand-700 hover:bg-brand-50 border-brand-200',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : size === 'lg' ? 'px-5 py-2.5 text-[15px] font-semibold' : 'px-3.5 py-1.5 text-sm',
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
        active ? 'border-slate-900 bg-slate-900 text-white' : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
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
      <span className="text-xs font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:text-slate-500';

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
        className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-slate-900' : 'bg-slate-300')}
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
  blue: 'bg-slate-100 text-slate-800 ring-slate-300',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-brand-50 text-brand-700 ring-brand-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  teal: 'bg-slate-900 text-white ring-slate-900',
};
export function Badge({ tone = 'slate', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap', TONES[tone], className)}>{children}</span>;
}

export function Card({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx('rounded-xl border border-slate-200 bg-white', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <div className="flex items-center gap-1.5">{actions}</div>
        </header>
      )}
      <div className={cx('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function PanelSection({ title, children, actions, className }: { title: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx('border-b border-slate-100 px-3.5 py-3.5', className)}>
      <div className="mb-2.5 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold tracking-[0.08em] text-slate-900 uppercase">{title}</h4>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={cx('flex max-h-[92vh] w-full flex-col rounded-2xl bg-white shadow-xl', wide ? 'max-w-6xl' : 'max-w-xl')}>
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

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-slate-500">
      {icon && <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700">{icon}</div>}
      <p className="font-semibold text-slate-900">{title}</p>
      {children && <div className="max-w-md text-sm">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Indicateur de chargement discret. */
export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" />
      {label}
    </div>
  );
}

/** Barre de progression rouge sur fond gris. */
export function ProgressBar({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-slate-200', className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label}>
      <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${v * 100}%` }} />
    </div>
  );
}

/** Carte de sélection (choix visuel) : bordure rouge et fond teinté une fois sélectionnée. */
export function SelectCard({
  selected,
  onClick,
  children,
  className,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'relative rounded-xl border bg-white text-left transition-colors',
        selected ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600' : 'border-slate-200 hover:border-slate-400',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Compteur (−/+) avec saisie directe, pour les quantités entières. */
export function Counter({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  testId,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
  testId?: string;
}) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, Math.round(v))));
  return (
    <div className="inline-flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white">
      <button type="button" className="h-8 w-8 text-lg leading-none text-slate-700 hover:bg-slate-100 disabled:opacity-30" onClick={() => set(value - 1)} disabled={value <= min} aria-label="Retirer une unité" title={`Retirer une unité`}>
        −
      </button>
      <IntInput unstyled value={value} onChange={(v) => set(v)} max={max} aria-label={label} data-testid={testId} className="h-8 w-12 border-x border-slate-200 bg-white text-sm text-slate-900 outline-none" />
      <button type="button" className="h-8 w-8 text-lg leading-none text-slate-700 hover:bg-slate-100 disabled:opacity-30" onClick={() => set(value + 1)} disabled={value >= max} aria-label="Ajouter une unité" title={`Ajouter une unité`}>
        +
      </button>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'brand' | 'default' }) {
  return (
    <div className={cx('rounded-lg px-3 py-2', tone === 'brand' ? 'bg-slate-900 text-white' : 'bg-slate-50')}>
      <div className={cx('text-[11px] uppercase tracking-wide', tone === 'brand' ? 'text-slate-300' : 'text-slate-500')}>{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className={cx('text-[11px]', tone === 'brand' ? 'text-slate-300' : 'text-slate-500')}>{sub}</div>}
    </div>
  );
}

/**
 * Saisie d'un nombre entier positif ou nul : les valeurs négatives, décimales ou
 * non numériques sont refusées (champ signalé en rouge, valeur précédente conservée).
 */
export function IntInput({
  value,
  onChange,
  max = 99,
  className,
  unstyled = false,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'max'> & { value: number; onChange: (v: number) => void; max?: number; unstyled?: boolean }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);
  const valid = /^\d+$/.test(text.trim()) && Number(text) <= max;
  return (
    <input
      {...rest}
      inputMode="numeric"
      value={text}
      aria-invalid={!valid}
      title={valid ? rest.title : `Nombre entier entre 0 et ${max}`}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setText(String(value));
      }}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (/^\d+$/.test(t.trim()) && Number(t) <= max) onChange(Number(t));
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const n = Math.max(0, Math.min(max, value + (e.key === 'ArrowUp' ? 1 : -1)));
          onChange(n);
          setText(String(n));
        }
      }}
      className={cx(unstyled ? '' : inputCls.replace('w-full ', ''), className ? '' : 'w-16', 'text-center tabular-nums', !valid && 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-100', className)}
    />
  );
}
