import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useApp } from './state/store';
import { Header } from './ui/Header';
import { Dashboard } from './ui/Dashboard';
import { Workspace } from './ui/workspace/Workspace';
import { CatalogAdmin } from './ui/catalog/CatalogAdmin';
import { ErrorBoundary } from './ui/ErrorBoundary';

function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-96 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className="pointer-events-auto flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-lg"
        >
          {t.kind === 'error' ? (
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
          ) : t.kind === 'success' ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
          ) : (
            <Info size={16} className="mt-0.5 shrink-0 text-brand-600" />
          )}
          <span className="flex-1 text-slate-700">{t.text}</span>
          <button onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-600" aria-label="Fermer">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function App() {
  const view = useApp((s) => s.view);
  const loadErrors = useApp((s) => s.loadErrors);
  const toast = useApp((s) => s.toast);
  useEffect(() => {
    loadErrors.forEach((e) => toast('error', e));
  }, [loadErrors, toast]);

  return (
    <div className="flex h-full min-w-[1180px] flex-col">
      <Header />
      <main className="min-h-0 flex-1">
        <ErrorBoundary>
          {view === 'dashboard' && <Dashboard />}
          {view === 'workspace' && <Workspace />}
          {view === 'catalog' && <CatalogAdmin />}
        </ErrorBoundary>
      </main>
      <Toasts />
    </div>
  );
}
