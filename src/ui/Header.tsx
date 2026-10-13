import { BookOpen, ClipboardCheck, FolderOpen, LayoutDashboard, Save, Settings } from 'lucide-react';
import { useApp, type View } from '@/state/store';
import { cx } from './kit';
import { formatDateTime } from '@/lib/format';

/**
 * Barre de navigation : identité typographique temporaire (aucun logo officiel n'est
 * reproduit tant qu'un fichier autorisé n'est pas fourni), rubrique active soulignée en rouge.
 */
export function Header() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const saveState = useApp((s) => s.saveState);
  const saveNow = useApp((s) => s.saveNow);
  const toast = useApp((s) => s.toast);

  const items: { key: View; label: string; icon: React.ReactNode; active: boolean }[] = [
    { key: 'dashboard', label: 'Tableau de bord', icon: <LayoutDashboard size={16} />, active: view === 'dashboard' },
    { key: 'dossiers', label: 'Dossiers', icon: <FolderOpen size={16} />, active: view === 'dossiers' || view === 'workspace' },
    { key: 'audits', label: 'Audits', icon: <ClipboardCheck size={16} />, active: view === 'audits' },
    { key: 'catalog', label: 'Catalogue', icon: <BookOpen size={16} />, active: view === 'catalog' },
    { key: 'settings', label: 'Paramètres', icon: <Settings size={16} />, active: view === 'settings' },
  ];

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 lg:gap-6 lg:px-6">
      <button className="flex shrink-0 items-center gap-2.5" onClick={() => setView('dashboard')} aria-label="Sector Alarm Movers – accueil">
        <span className="h-6 w-1.5 rounded-full bg-brand-600" aria-hidden />
        <span className="text-left leading-tight">
          <span className="block text-[15px] font-bold tracking-tight text-slate-900">
            Sector Alarm <span className="font-semibold text-brand-600">Movers</span>
          </span>
          <span className="hidden text-[10px] font-medium tracking-wide text-slate-500 uppercase sm:block">Prototype interne · non officiel</span>
        </span>
      </button>
      <nav className="flex h-full items-stretch gap-0.5 lg:gap-1" aria-label="Navigation principale">
        {items.map((it) => (
          <button
            key={it.key}
            onClick={() => setView(it.key)}
            aria-current={it.active ? 'page' : undefined}
            title={it.label}
            className={cx(
              'relative flex items-center gap-1.5 px-2.5 text-sm font-medium lg:px-3',
              it.active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900',
            )}
          >
            {it.icon}
            <span className="hidden md:inline">{it.label}</span>
            {it.active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-600" />}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-3 text-xs">
        <span className={cx('hidden xl:inline', saveState.error ? 'text-brand-700' : 'text-slate-500')} title="Données enregistrées dans ce navigateur uniquement">
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
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50"
        >
          <Save size={14} /> Enregistrer
        </button>
      </div>
    </header>
  );
}
