import { BookOpen, LayoutDashboard, Save, ShieldCheck } from 'lucide-react';
import { useApp } from '@/state/store';
import { cx } from './kit';
import { formatDateTime } from '@/lib/format';

export function Header() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const saveState = useApp((s) => s.saveState);
  const saveNow = useApp((s) => s.saveNow);
  const toast = useApp((s) => s.toast);

  const nav = (key: 'dashboard' | 'catalog', label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setView(key)}
      className={cx(
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        view === key ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white',
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 bg-brand-800 px-4 text-white shadow">
      <button className="flex items-center gap-2.5" onClick={() => setView('dashboard')}>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
          <ShieldCheck size={18} />
        </span>
        <span className="text-left leading-tight">
          <span className="block text-sm font-semibold">Audit Movers</span>
          <span className="block text-[11px] text-brand-200">Prototype de démonstration – non officiel</span>
        </span>
      </button>
      <nav className="ml-4 flex items-center gap-1">
        {nav('dashboard', 'Tableau de bord', <LayoutDashboard size={15} />)}
        {nav('catalog', 'Catalogue & règles', <BookOpen size={15} />)}
      </nav>
      <div className="ml-auto flex items-center gap-3 text-xs">
        <span className={cx('hidden md:inline', saveState.error ? 'text-red-300' : 'text-brand-200')} title="Données enregistrées dans ce navigateur uniquement">
          {saveState.error
            ? saveState.error
            : saveState.lastSavedAt
              ? `Enregistré localement · ${formatDateTime(saveState.lastSavedAt)}`
              : 'Enregistrement local automatique'}
        </span>
        <button
          onClick={() => {
            const ok = saveNow();
            toast(ok ? 'success' : 'error', ok ? 'Travail enregistré dans ce navigateur.' : "L'enregistrement a échoué.");
          }}
          className="flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 font-medium hover:bg-white/20"
        >
          <Save size={14} /> Enregistrer
        </button>
      </div>
    </header>
  );
}
