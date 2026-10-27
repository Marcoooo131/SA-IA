import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { friendlyError } from '../lib/errors';

type Kind = 'success' | 'error' | 'info' | 'warning';
interface Toast {
  id: number;
  kind: Kind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (errOrMessage: unknown) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let nextId = 1;

const ICONS = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
const STYLES: Record<Kind, string> = {
  success: 'border-l-green-500',
  error: 'border-l-brand',
  info: 'border-l-neutral-400',
  warning: 'border-l-amber-500',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (kind: Kind, message: string) => {
      const id = nextId++;
      setToasts((t) => [...t.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === 'error' || kind === 'warning' ? 7000 : 3500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (e) => push('error', typeof e === 'string' ? e : friendlyError(e)),
      info: (m) => push('info', m),
      warning: (m) => push('warning', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className={`animate-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-l-4 border-neutral-200 bg-white p-3 text-sm shadow-lg ${STYLES[t.kind]}`}
            >
              <Icon
                className={`mt-0.5 h-5 w-5 shrink-0 ${
                  t.kind === 'success' ? 'text-green-600' : t.kind === 'warning' ? 'text-amber-500' : t.kind === 'error' ? 'text-brand' : 'text-neutral-500'
                }`}
              />
              <p className="flex-1 text-neutral-800">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="text-neutral-400 hover:text-neutral-700" aria-label="Fermer">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast hors de ToastProvider');
  return ctx;
}
