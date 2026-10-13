import { Armchair, Box, LayoutGrid, ShieldCheck, Sofa } from 'lucide-react';
import { useApp } from '@/state/store';
import { useEditor, type DisplayMode } from '@/state/editor';
import { cx } from '../kit';

const MODES: { id: DisplayMode; label: string; icon: React.ReactNode }[] = [
  { id: 'plan_archi', label: 'Plan architectural', icon: <LayoutGrid size={13} /> },
  { id: 'plan_meuble', label: 'Plan meublé', icon: <Sofa size={13} /> },
  { id: '3d_meuble', label: '3D meublée', icon: <Armchair size={13} /> },
  { id: '3d_securite', label: '3D + équipements de sécurité', icon: <ShieldCheck size={13} /> },
  { id: '3d_sans_mobilier', label: '3D sans mobilier', icon: <Box size={13} /> },
];

/** Bascule entre les vues du logement, sans perte des modifications (mêmes données). */
export function DisplayModeBar() {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const ed = useEditor();
  const current: DisplayMode =
    tab === 'plan'
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
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-3 py-1.5" role="radiogroup" aria-label="Mode d'affichage" data-testid="display-modes">
      {MODES.map((m) => (
        <button
          key={m.id}
          role="radio"
          aria-checked={current === m.id}
          onClick={() => choose(m.id)}
          className={cx(
            'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
            current === m.id ? 'border-brand-600 bg-brand-700 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
          )}
          data-testid={`mode-${m.id}`}
        >
          {m.icon}
          {m.label}
        </button>
      ))}
    </div>
  );
}
