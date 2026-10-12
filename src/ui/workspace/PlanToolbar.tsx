import { useRef } from 'react';
import {
  DoorClosed,
  DoorOpen,
  Eye,
  FileImage,
  Grid3x3,
  Hand,
  Magnet,
  Maximize,
  MousePointer2,
  Redo2,
  Ruler,
  Square,
  Tags,
  Undo2,
  ZoomIn,
  ZoomOut,
  PanelTop,
  RectangleHorizontal,
  Warehouse,
  Slash,
} from 'lucide-react';
import { useApp, useActiveDossier } from '@/state/store';
import { useEditor, type Tool } from '@/state/editor';
import { IconButton } from '../kit';
import { importPlanFile } from '@/plan/importImage';
import { putAsset } from '@/persistence/assets';
import { uid } from '@/lib/id';
import { findLevel } from '@/plan/actions';
import { levelBounds } from '@/plan/geometry';

const TOOLS: { tool: Tool; label: string; icon: React.ReactNode }[] = [
  { tool: 'select', label: 'Sélectionner / déplacer (Échap)', icon: <MousePointer2 size={16} /> },
  { tool: 'pan', label: 'Déplacer la vue', icon: <Hand size={16} /> },
  { tool: 'room', label: 'Dessiner une pièce', icon: <Square size={16} /> },
  { tool: 'wall', label: 'Tracer un mur / une cloison (Maj : droit)', icon: <Slash size={16} /> },
  { tool: 'porte', label: 'Porte extérieure', icon: <DoorClosed size={16} /> },
  { tool: 'fenetre', label: 'Fenêtre', icon: <PanelTop size={16} /> },
  { tool: 'baie', label: 'Baie vitrée', icon: <RectangleHorizontal size={16} /> },
  { tool: 'porte_garage', label: 'Porte de garage', icon: <Warehouse size={16} /> },
  { tool: 'porte_interieure', label: 'Porte intérieure', icon: <DoorOpen size={16} /> },
  { tool: 'calibrate', label: "Définir l'échelle du plan importé", icon: <Ruler size={16} /> },
];

export function PlanToolbar() {
  const ed = useEditor();
  const undo = useApp((s) => s.undo);
  const redo = useApp((s) => s.redo);
  const history = useApp((s) => s.history);
  const mutate = useApp((s) => s.mutate);
  const select = useApp((s) => s.select);
  const toast = useApp((s) => s.toast);
  const armProduct = useApp((s) => s.armProduct);
  const levelId = useApp((s) => s.activeLevelId);
  const dossier = useActiveDossier();
  const fileRef = useRef<HTMLInputElement>(null);

  const zoom = (f: number) => {
    const v = ed.view;
    const cx = v.x + 400 / v.scale;
    const cy = v.y + 300 / v.scale;
    const scale = Math.max(8, Math.min(250, v.scale * f));
    ed.set({ view: { scale, x: cx - 400 / scale, y: cy - 300 / scale } });
  };

  const onFile = async (file: File | undefined) => {
    if (!file || !dossier || !levelId) return;
    try {
      const img = await importPlanFile(file);
      const assetId = uid('asset');
      await putAsset(assetId, img.dataUrl);
      const level = dossier.plan.levels.find((l) => l.id === levelId);
      const b = level ? levelBounds(level) : null;
      const width = b ? Math.max(8, b.maxX - b.minX) : 15;
      mutate((d) => {
        findLevel(d, levelId).background = {
          assetId,
          name: img.name,
          x: b?.minX ?? 0,
          y: b?.minY ?? 0,
          width,
          aspect: img.height / img.width,
          rotation: 0,
          opacity: 0.6,
          visible: true,
          locked: false,
          calibrated: false,
        };
      });
      select({ kind: 'background' });
      ed.setTool('calibrate');
      ed.requestFit();
      toast('info', `Plan « ${img.name} » importé comme fond. Cliquez maintenant deux points d'une dimension connue pour définir l'échelle.`);
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-2" role="toolbar" aria-label="Outils du plan">
      {TOOLS.map((t) => (
        <IconButton
          key={t.tool}
          label={t.label}
          active={ed.tool === t.tool}
          onClick={() => {
            ed.setTool(t.tool);
            armProduct(null);
          }}
        >
          {t.icon}
        </IconButton>
      ))}
      <div className="mx-1 h-6 w-px bg-slate-200" />
      <IconButton label="Annuler (Ctrl+Z)" onClick={undo} disabled={!history.past.length}>
        <Undo2 size={16} />
      </IconButton>
      <IconButton label="Rétablir (Ctrl+Y)" onClick={redo} disabled={!history.future.length}>
        <Redo2 size={16} />
      </IconButton>
      <div className="mx-1 h-6 w-px bg-slate-200" />
      <IconButton label="Zoom avant" onClick={() => zoom(1.25)}>
        <ZoomIn size={16} />
      </IconButton>
      <IconButton label="Zoom arrière" onClick={() => zoom(0.8)}>
        <ZoomOut size={16} />
      </IconButton>
      <IconButton label="Recadrer sur le plan" onClick={ed.requestFit}>
        <Maximize size={16} />
      </IconButton>
      <div className="mx-1 h-6 w-px bg-slate-200" />
      <IconButton label="Grille magnétique" active={ed.snap} onClick={() => ed.set({ snap: !ed.snap })}>
        <Grid3x3 size={16} />
      </IconButton>
      <select
        aria-label="Pas de la grille"
        className="h-8 rounded-md border border-slate-200 bg-white px-1 text-xs"
        value={ed.grid}
        onChange={(e) => ed.set({ grid: Number(e.target.value) })}
      >
        <option value={0.05}>5 cm</option>
        <option value={0.1}>10 cm</option>
        <option value={0.25}>25 cm</option>
        <option value={0.5}>50 cm</option>
        <option value={1}>1 m</option>
      </select>
      <IconButton label="Alignement magnétique sur les pièces" active={ed.align} onClick={() => ed.set({ align: !ed.align })}>
        <Magnet size={16} />
      </IconButton>
      <IconButton label="Zones de détection indicatives" active={ed.showCoverage} onClick={() => ed.set({ showCoverage: !ed.showCoverage })}>
        <Eye size={16} />
      </IconButton>
      <IconButton label="Libellés" active={ed.showLabels} onClick={() => ed.set({ showLabels: !ed.showLabels })}>
        <Tags size={16} />
      </IconButton>
      <div className="ml-auto flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
          className="hidden"
          data-testid="plan-import-input"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50"
          title="Importer un plan ou une photo (PNG, JPG, PDF) comme fond de référence"
        >
          <FileImage size={14} /> Importer un plan
        </button>
      </div>
    </div>
  );
}
