import { Armchair, Box, LayoutGrid, Map as MapIcon, Save, ShieldCheck, Sofa } from 'lucide-react';
import { useApp } from '@/state/store';
import { useEditor, type DisplayMode } from '@/state/editor';
import { cx } from '../kit';

const MODES: { id: DisplayMode; label: string; icon: React.ReactNode; dim: '2d' | '3d' }[] = [
  { id: 'plan_archi', label: 'Plan architectural', icon: <LayoutGrid size={13} />, dim: '2d' },
  { id: 'plan_meuble', label: 'Plan meublé', icon: <Sofa size={13} />, dim: '2d' },
  { id: '3d_meuble', label: '3D meublée', icon: <Armchair size={13} />, dim: '3d' },
  { id: '3d_securite', label: '3D + équipements de sécurité', icon: <ShieldCheck size={13} />, dim: '3d' },
  { id: '3d_sans_mobilier', label: '3D sans mobilier', icon: <Box size={13} />, dim: '3d' },
];

/**
 * Barre d'affichage de la zone de conception : bascule 2D / 3D, vues prédéfinies,
 * mobilier et équipements de sécurité affichés ou masqués, enregistrement.
 * Toutes les vues lisent les mêmes données : aucune modification n'est perdue.
 */
export function DisplayModeBar() {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const saveNow = useApp((s) => s.saveNow);
  const toast = useApp((s) => s.toast);
  const ed = useEditor();
  const is3d = tab === 'vue3d';
  const current: DisplayMode = !is3d
    ? ed.show2dFurniture
      ? 'plan_meuble'
      : 'plan_archi'
    : !ed.show3dFurniture
      ? '3d_sans_mobilier'
      : ed.show3dDevices
        ? '3d_securite'
        : '3d_meuble';
  const choose = (m: DisplayMode) => {
    switch (m) {
      case 'plan_archi':
        ed.set({ show2dFurniture: false });
        setTab('plan');
        break;
      case 'plan_meuble':
        ed.set({ show2dFurniture: true });
        setTab('plan');
        break;
      case '3d_meuble':
        ed.set({ show3dFurniture: true, show3dDevices: false });
        setTab('vue3d');
        break;
      case '3d_securite':
        ed.set({ show3dFurniture: true, show3dDevices: true });
        setTab('vue3d');
        break;
      case '3d_sans_mobilier':
        ed.set({ show3dFurniture: false, show3dDevices: true });
        setTab('vue3d');
        break;
    }
  };
  const furniture = is3d ? ed.show3dFurniture : ed.show2dFurniture;
  const devices = is3d ? ed.show3dDevices : ed.show2dDevices;
  const toggle = (active: boolean, onClick: () => void, icon: React.ReactNode, label: string, testId: string) => (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cx(
        'flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium',
        active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400',
      )}
      data-testid={testId}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-1.5" data-testid="display-bar">
      {/* Bascule 2D / 3D */}
      <div className="flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Plan 2D ou maquette 3D">
        {(
          [
            ['plan', '2D', <MapIcon key="2" size={13} />],
            ['vue3d', '3D', <Box key="3" size={13} />],
          ] as const
        ).map(([t, label, icon]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={cx('flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold', tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900')}
            data-testid={`switch-${t}`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Mode d'affichage" data-testid="display-modes">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={current === m.id}
            onClick={() => choose(m.id)}
            title={m.label}
            className={cx(
              'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium',
              current === m.id ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-600' : 'text-slate-600 hover:bg-slate-100',
              (is3d ? m.dim === '2d' : m.dim === '3d') && 'hidden xl:flex',
            )}
            data-testid={`mode-${m.id}`}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        {toggle(
          furniture,
          () => ed.set(is3d ? { show3dFurniture: !ed.show3dFurniture } : { show2dFurniture: !ed.show2dFurniture }),
          <Sofa size={13} />,
          furniture ? 'Mobilier affiché' : 'Mobilier masqué',
          'toggle-furniture',
        )}
        {toggle(
          devices,
          () => ed.set(is3d ? { show3dDevices: !ed.show3dDevices } : { show2dDevices: !ed.show2dDevices }),
          <ShieldCheck size={13} />,
          devices ? 'Équipements affichés' : 'Équipements masqués',
          'toggle-devices',
        )}
        <button
          onClick={() => {
            const ok = saveNow();
            toast(ok ? 'success' : 'error', ok ? 'Travail enregistré dans ce navigateur.' : "L'enregistrement a échoué.");
          }}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700"
          title="Enregistrer"
          aria-label="Enregistrer le dossier"
        >
          <Save size={13} />
          <span className="hidden lg:inline">Enregistrer</span>
        </button>
      </div>
    </div>
  );
}
