import { useState } from 'react';
import { Copy, Layers, Plus, Trash2 } from 'lucide-react';
import { useApp, useActiveDossier } from '@/state/store';
import { ProductArt } from '../ProductArt';
import { useEditor } from '@/state/editor';
import type { ProductCategory, RoomType } from '@/domain/types';
import { CATEGORY_COLORS, CATEGORY_GLYPH, CATEGORY_LABELS, ROOM_TYPE_LABELS } from '@/domain/labels';
import { addLevel, addRoom, copyFootprint, findLevel, freeSpot, removeLevel } from '@/plan/actions';
import { roomArea } from '@/plan/geometry';
import { formatEuro, formatMonthly, formatNumber } from '@/lib/format';
import { Button, IconButton, Modal, PanelSection, Select, cx } from '../kit';

export function LevelsPanel() {
  const dossier = useActiveDossier();
  const levelId = useApp((s) => s.activeLevelId);
  const setLevel = useApp((s) => s.setActiveLevel);
  const mutate = useApp((s) => s.mutate);
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!dossier) return null;
  const levels = [...dossier.plan.levels].sort((a, b) => a.index - b.index);
  return (
    <PanelSection
      title="Niveaux"
      actions={
        <button
          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
          onClick={() => {
            let id = '';
            mutate((d) => {
              id = addLevel(d.plan).id;
            });
            setLevel(id);
          }}
        >
          <Plus size={13} /> Ajouter
        </button>
      }
    >
      <div className="flex flex-col gap-1">
        {levels.map((l) => (
          <div
            key={l.id}
            className={cx(
              'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
              l.id === levelId ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-200' : 'hover:bg-slate-50',
            )}
          >
            <Layers size={14} className="shrink-0 text-slate-400" />
            <button className="flex-1 truncate text-left" onClick={() => setLevel(l.id)} data-testid={`level-${l.name}`}>
              <span className="font-medium">{l.name}</span>
              <span className="ml-1 text-xs text-slate-500">· {l.rooms.length} pièce(s)</span>
            </button>
            {levels.length > 1 && (
              <IconButton label={`Supprimer ${l.name}`} className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => setConfirm(l.id)}>
                <Trash2 size={13} />
              </IconButton>
            )}
          </div>
        ))}
      </div>
      {(() => {
        const current = levels.find((l) => l.id === levelId);
        const below = current ? levels.find((l) => l.index === current.index - 1) : undefined;
        if (!current || current.rooms.length || !below?.rooms.length) return null;
        return (
          <Button
            size="sm"
            className="mt-2 w-full"
            icon={<Copy size={13} />}
            onClick={() => mutate((d) => copyFootprint(findLevel(d, below.id), findLevel(d, current.id)))}
          >
            Reprendre l'emprise de « {below.name} »
          </Button>
        );
      })()}
      {confirm && (
        <Modal
          title="Supprimer le niveau ?"
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button onClick={() => setConfirm(null)}>Annuler</Button>
              <Button
                variant="danger"
                onClick={() => {
                  mutate((d) => removeLevel(d, confirm));
                  setLevel(levels.find((l) => l.id !== confirm)!.id);
                  setConfirm(null);
                }}
              >
                Supprimer
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">Les pièces, ouvertures et équipements de ce niveau seront supprimés (action annulable avec Ctrl+Z).</p>
        </Modal>
      )}
    </PanelSection>
  );
}

export function RoomsPanel() {
  const dossier = useActiveDossier();
  const levelId = useApp((s) => s.activeLevelId);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const mutate = useApp((s) => s.mutate);
  const ed = useEditor();
  const level = dossier?.plan.levels.find((l) => l.id === levelId);
  if (!dossier || !level) return null;
  return (
    <PanelSection
      title={`Pièces – ${level.name}`}
      actions={
        <button
          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
          onClick={() => {
            let id = '';
            mutate((d) => {
              const l = findLevel(d, level.id);
              const spot = freeSpot(l, 3, 3);
              id = addRoom(l, { ...spot, w: 3, h: 3 }, ed.nextRoomType).id;
            });
            select({ kind: 'room', id });
          }}
          data-testid="add-room"
        >
          <Plus size={13} /> Ajouter
        </button>
      }
    >
      <label className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        Type des nouvelles pièces
        <Select value={ed.nextRoomType} onChange={(e) => ed.set({ nextRoomType: e.target.value as RoomType })} className="h-7 flex-1 py-0 text-xs" aria-label="Type des nouvelles pièces">
          {Object.entries(ROOM_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </label>
      {level.rooms.length === 0 ? (
        <p className="text-xs text-slate-500">Aucune pièce sur ce niveau.</p>
      ) : (
        <ul className="flex max-h-56 flex-col gap-0.5 overflow-auto scroll-thin">
          {level.rooms.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => select({ kind: 'room', id: r.id })}
                className={cx(
                  'flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm',
                  selection?.kind === 'room' && selection.id === r.id ? 'bg-brand-50 text-brand-800' : 'hover:bg-slate-50',
                )}
              >
                <span className="truncate">{r.name}</span>
                <span className="shrink-0 text-xs text-slate-500 tabular-nums">{formatNumber(roomArea(r), 1)} m²</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-slate-500">
        {level.openings.length} ouverture(s) dont {level.openings.filter((o) => o.exterior).length} extérieure(s) ·{' '}
        {formatNumber(level.rooms.reduce((s, r) => s + roomArea(r), 0), 1)} m²
      </p>
    </PanelSection>
  );
}

export function CategoryDot({ category, suggested }: { category: ProductCategory; suggested?: boolean }) {
  const color = CATEGORY_COLORS[category];
  return (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
      style={suggested ? { border: `2px dashed ${color}`, color, background: '#fff' } : { background: color, color: '#fff' }}
    >
      {CATEGORY_GLYPH[category]}
    </span>
  );
}

export function EquipmentLibrary({ onArm }: { onArm?: () => void }) {
  const products = useApp((s) => s.catalog.products);
  const armed = useApp((s) => s.armedProductId);
  const arm = useApp((s) => s.armProduct);
  const dossier = useActiveDossier();
  const setTool = useEditor((s) => s.setTool);
  const placeable = products.filter((p) => p.active && p.billing !== 'lot');
  const count = (id: string, suggested: boolean) =>
    (dossier?.devices ?? []).filter((d) => d.productId === id && (d.origin === 'suggere' && !d.validated) === suggested).reduce((n, d) => n + d.quantity, 0);
  return (
    <PanelSection title="Équipements de sécurité">
      <p className="mb-2.5 text-[11px] text-slate-500">Choisissez un équipement puis cliquez sur le plan (2D ou 3D) pour le placer.</p>
      <ul className="grid grid-cols-2 gap-2">
        {placeable.map((p) => {
          const placed = count(p.id, false);
          const suggested = count(p.id, true);
          const isArmed = armed === p.id;
          return (
            <li key={p.id}>
              <button
                onClick={() => {
                  if (isArmed) {
                    arm(null);
                    setTool('select');
                  } else {
                    arm(p.id);
                    setTool('device');
                    onArm?.();
                  }
                }}
                aria-pressed={isArmed}
                className={cx(
                  'flex h-full w-full flex-col items-stretch gap-1 rounded-xl border bg-white p-2 text-left',
                  isArmed ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600' : 'border-slate-200 hover:border-slate-400',
                )}
                data-testid={`library-${p.reference}`}
                title={p.description}
              >
                <span className="flex items-start justify-between">
                  <ProductArt category={p.category} size={40} />
                  <CategoryDot category={p.category} />
                </span>
                <span className="text-[11px] leading-tight font-semibold text-slate-900">{p.name}</span>
                <span className="text-[10px] text-slate-500">{CATEGORY_LABELS[p.category]}</span>
                <span className="mt-auto text-[11px] text-slate-800 tabular-nums">
                  {p.priceInitial === null ? 'Prix non communiqué' : formatEuro(p.priceInitial)}
                  {p.category === 'centrale' ? ' · 0 €/mois' : p.monthly ? ` · +${formatMonthly(p.monthly)}` : ''}
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  {isArmed ? (
                    <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">Sélectionné</span>
                  ) : (
                    <span className="rounded-full border border-slate-300 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">+ Ajouter</span>
                  )}
                  {placed > 0 && <span className="text-[10px] text-slate-600">{placed} placé(s)</span>}
                  {suggested > 0 && <span className="text-[10px] text-slate-500 italic">{suggested} proposé(s)</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 space-y-1 text-[11px] text-slate-500">
        <div className="flex items-center gap-2">
          <CategoryDot category="detecteur_mouvement" /> Placé par le conseiller / validé
        </div>
        <div className="flex items-center gap-2">
          <CategoryDot category="detecteur_mouvement" suggested /> Proposé automatiquement, à valider
        </div>
      </div>
    </PanelSection>
  );
}

export function categoryLabel(c: ProductCategory) {
  return CATEGORY_LABELS[c];
}
