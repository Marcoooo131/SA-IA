import { useMemo, useState } from 'react';
import { CopyPlus, Lock, Plus, RotateCcw, RotateCw, Search, Trash2, Unlock, Wand2 } from 'lucide-react';
import { useApp, useActiveDossier } from '@/state/store';
import { useEditor } from '@/state/editor';
import type { Level, Opening, Room } from '@/domain/types';
import { findLevel } from '@/plan/actions';
import { FURNITURE_CATEGORY_LABELS, FURNITURE_MODELS, getFurnitureModel, modelsForRoom, type FurnitureCategory } from '@/furniture/models';
import { FurnitureThumb } from '@/furniture/Furniture2D';
import { JOINERY_MODELS, getJoineryModel, joineryModelOf, openingLeaves, type JoineryModelId } from '@/furniture/joineryModels';
import {
  addFurniture,
  duplicateFurniture,
  furnishEmptyRooms,
  removeFurniture,
  resetRoomFurniture,
  rotateFurniture,
  setFurnitureVariant,
  updateFurniture,
} from '@/furniture/actions';
import { ROOMS_WITHOUT_DEFAULT } from '@/furniture/placement';
import { openingAuditStatus, OPENING_AUDIT_LABELS } from '@/plan/joinery';
import { formatNumber } from '@/lib/format';
import { Badge, Button, Field, NumberInput, PanelSection, Select, Toggle, cx } from '../kit';

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

// ---------------------------------------------------------------------------
// Propriétés d'un objet de mobilier
// ---------------------------------------------------------------------------

export function FurnitureProperties({ level, id }: { level: Level; id: string }) {
  const mutate = useApp((s) => s.mutate);
  const select = useApp((s) => s.select);
  const dossier = useActiveDossier();
  const item = (level.furniture ?? []).find((f) => f.id === id);
  if (!item || !dossier) return null;
  const model = getFurnitureModel(item.modelId);
  const room = level.rooms.find((r) => r.id === item.roomId);
  const edit = (fn: (l: Level) => void) => mutate((d) => fn(findLevel(d, level.id)));
  return (
    <PanelSection title="Mobilier">
      <div className="flex flex-col gap-2.5" data-testid="furniture-properties">
        <div className="flex items-center gap-2">
          <FurnitureThumb modelId={item.modelId} size={40} />
          <div>
            <div className="text-sm font-semibold text-slate-800">{model?.name ?? item.modelId}</div>
            <div className="text-[11px] text-slate-500">{room ? room.name : 'Hors pièce'}</div>
          </div>
          <Badge tone={item.origin === 'genere' ? 'slate' : 'blue'} className="ml-auto">
            {item.origin === 'genere' ? 'Généré' : 'Modifié'}
          </Badge>
        </div>
        <p className="text-[11px] text-slate-500">Mobilier générique de visualisation : sans effet sur l'audit ni sur la couverture des détecteurs.</p>
        {model?.variants && (
          <Field label="Variante">
            <Select value={item.variant ?? model.variants[0].id} onChange={(e) => edit((l) => setFurnitureVariant(l, item.id, e.target.value))} name="furniture-variant">
              {model.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Grid2>
          <Field label="Position X">
            <NumberInput value={item.x} onChange={(v) => v !== null && edit((l) => updateFurniture(l, item.id, { x: v }))} step={0.05} suffix="m" name="furniture-x" />
          </Field>
          <Field label="Position Y">
            <NumberInput value={item.y} onChange={(v) => v !== null && edit((l) => updateFurniture(l, item.id, { y: v }))} step={0.05} suffix="m" name="furniture-y" />
          </Field>
          <Field label="Largeur">
            <NumberInput value={item.w} disabled={!model?.resizable} onChange={(v) => v && edit((l) => updateFurniture(l, item.id, { w: v }))} min={0.1} max={8} step={0.05} suffix="m" name="furniture-w" />
          </Field>
          <Field label="Profondeur">
            <NumberInput value={item.d} disabled={!model?.resizable} onChange={(v) => v && edit((l) => updateFurniture(l, item.id, { d: v }))} min={0.1} max={8} step={0.05} suffix="m" name="furniture-d" />
          </Field>
          <Field label="Hauteur">
            <NumberInput value={item.h} disabled={!model?.resizable} onChange={(v) => v && edit((l) => updateFurniture(l, item.id, { h: v }))} min={0.02} max={3} step={0.05} suffix="m" name="furniture-h" />
          </Field>
          <Field label="Orientation">
            <NumberInput value={item.rotation} onChange={(v) => v !== null && edit((l) => updateFurniture(l, item.id, { rotation: v }))} step={15} suffix="°" name="furniture-rotation" />
          </Field>
        </Grid2>
        <Field label="Couleur">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={item.color ?? model?.color ?? '#999999'}
              onChange={(e) => edit((l) => updateFurniture(l, item.id, { color: e.target.value }))}
              className="h-8 w-12 cursor-pointer rounded border border-slate-200"
              aria-label="Couleur de l'objet"
            />
            {item.color && (
              <button className="text-[11px] text-brand-600 hover:underline" onClick={() => edit((l) => updateFurniture(l, item.id, { color: undefined }))}>
                Couleur par défaut
              </button>
            )}
          </div>
        </Field>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" icon={<RotateCw size={13} />} onClick={() => edit((l) => rotateFurniture(l, item.id, 90))} title="Raccourci : R">
            Pivoter 90°
          </Button>
          <Button
            size="sm"
            icon={<CopyPlus size={13} />}
            onClick={() => {
              let nid = '';
              edit((l) => void (nid = duplicateFurniture(l, item.id)?.id ?? ''));
              if (nid) select({ kind: 'furniture', id: nid });
            }}
          >
            Dupliquer
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 size={13} />}
            onClick={() => {
              edit((l) => removeFurniture(l, item.id));
              select(null);
            }}
          >
            Supprimer
          </Button>
        </div>
        {room && (
          <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => edit((l) => resetRoomFurniture(dossier.plan.levels, l, room.id))}>
            Réinitialiser le mobilier de « {room.name} »
          </Button>
        )}
        <p className="text-[11px] text-slate-400">
          {formatNumber(item.w)} × {formatNumber(item.d)} × {formatNumber(item.h)} m · glisser pour déplacer, R pour pivoter, Ctrl+D pour dupliquer, Suppr pour retirer.
        </p>
      </div>
    </PanelSection>
  );
}

// ---------------------------------------------------------------------------
// Mobilier d'une pièce (dans les propriétés de la pièce)
// ---------------------------------------------------------------------------

export function RoomFurnitureSection({ level, room }: { level: Level; room: Room }) {
  const mutate = useApp((s) => s.mutate);
  const select = useApp((s) => s.select);
  const dossier = useActiveDossier();
  if (!dossier) return null;
  const items = (level.furniture ?? []).filter((f) => f.roomId === room.id);
  const suggestions = modelsForRoom(room.type).slice(0, 6);
  const add = (modelId: string) => {
    let id = '';
    mutate((d) => void (id = addFurniture(findLevel(d, level.id), modelId, { room })?.id ?? ''));
    if (id) select({ kind: 'furniture', id });
  };
  return (
    <div className="mt-1 flex flex-col gap-1.5 border-t border-slate-100 pt-2" data-testid="room-furniture">
      <div className="text-xs font-semibold text-slate-700">Mobilier de la pièce ({items.length})</div>
      {items.length === 0 && (
        <p className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600" data-testid="room-empty">
          {ROOMS_WITHOUT_DEFAULT.includes(room.type) ? 'Pas de modèle d’aménagement pour ce type de pièce : ' : 'Pièce vide : '}
          choisissez son mobilier ci-dessous ou dans la bibliothèque.
        </p>
      )}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((m) => (
            <button key={m.id} onClick={() => add(m.id)} className="flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] hover:border-brand-300" title={`Ajouter : ${m.name}`}>
              <Plus size={10} /> {m.name}
            </button>
          ))}
        </div>
      )}
      <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => mutate((d) => void resetRoomFurniture(d.plan.levels, findLevel(d, level.id), room.id))} data-testid="reset-room-furniture">
        Réinitialiser le mobilier
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modèle de menuiserie (propriétés d'une ouverture)
// ---------------------------------------------------------------------------

export function JoineryFields({ level, opening }: { level: Level; opening: Opening }) {
  const mutate = useApp((s) => s.mutate);
  const rules = useApp((s) => s.rules);
  const model = joineryModelOf(opening);
  const def = getJoineryModel(model);
  const upd = (patch: Partial<Opening>) =>
    mutate((d) => {
      const o = findLevel(d, level.id).openings.find((x) => x.id === opening.id);
      if (o) Object.assign(o, patch);
    });
  const status = openingAuditStatus(opening, rules);
  return (
    <div className="flex flex-col gap-2 rounded border border-slate-200 bg-slate-50/60 p-2">
      <Field label="Modèle de menuiserie">
        <Select
          value={model}
          onChange={(e) => {
            const m = getJoineryModel(e.target.value as JoineryModelId);
            upd({ type: m.type, leaves: m.preset.leaves, entry: m.preset.entry, exterior: m.preset.exterior ?? opening.exterior, sectional: m.type === 'porte_garage' ? opening.sectional : false });
          }}
          name="opening-model"
        >
          {JOINERY_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Grid2>
        {def.swing && (
          <Field label="Sens d'ouverture">
            <Select value={opening.hinge ?? 'gauche'} onChange={(e) => upd({ hinge: e.target.value as 'gauche' | 'droite' })} name="opening-hinge">
              <option value="gauche">Paumelles à gauche</option>
              <option value="droite">Paumelles à droite</option>
            </Select>
          </Field>
        )}
        {(opening.type === 'fenetre' || opening.type === 'porte_fenetre') && (
          <Field label="Vantaux">
            <Select value={String(openingLeaves(opening))} onChange={(e) => upd({ leaves: Number(e.target.value) as 1 | 2 })} name="opening-leaves">
              <option value="1">1 vantail</option>
              <option value="2">2 vantaux</option>
            </Select>
          </Field>
        )}
        <Field label="Hauteur">
          <NumberInput value={opening.height ?? null} onChange={(v) => upd({ height: v ?? undefined })} allowNull placeholder={formatNumber(def.height)} min={0.3} max={3} step={0.05} suffix="m" name="opening-height" />
        </Field>
      </Grid2>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-500">Protection périmétrique :</span>
        <span className={cx(status === 'proteger' || status === 'a_positionner' ? 'font-medium text-brand-700' : 'text-slate-500')} data-testid="joinery-perimeter">
          {status === 'proteger' || status === 'a_positionner' ? 'À étudier' : OPENING_AUDIT_LABELS[status]}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bibliothèque « Mobilier et menuiseries » (colonne de gauche)
// ---------------------------------------------------------------------------

function JoineryThumb({ id }: { id: JoineryModelId }) {
  // symbole simplifié (même code couleur que le plan)
  const glass = id.startsWith('fenetre') || id === 'baie' || id === 'porte_fenetre';
  return (
    <svg width={40} height={28} viewBox="-1.3 -0.9 2.6 1.8" aria-hidden>
      <line x1={-1.3} y1={0} x2={-0.8} y2={0} stroke="#334155" strokeWidth={0.12} />
      <line x1={0.8} y1={0} x2={1.3} y2={0} stroke="#334155" strokeWidth={0.12} />
      {glass ? (
        <>
          <rect x={-0.8} y={-0.08} width={1.6} height={0.16} fill="#e0f2fe" stroke="#0369a1" strokeWidth={0.04} />
          {(id === 'fenetre_double' || id === 'baie') && <line x1={0} y1={-0.1} x2={0} y2={0.1} stroke="#0369a1" strokeWidth={0.05} />}
          {id === 'porte_fenetre' && <path d="M -0.8 0 L -0.8 0.8 A 0.8 0.8 0 0 0 0 0" fill="none" stroke="#0369a1" strokeWidth={0.04} strokeDasharray="0.08 0.05" />}
        </>
      ) : id === 'porte_garage' ? (
        <rect x={-0.8} y={-0.08} width={1.6} height={0.16} fill="#f1f5f9" stroke="#d7001e" strokeWidth={0.05} strokeDasharray="0.1 0.06" />
      ) : id === 'passage' ? (
        <line x1={-0.8} y1={0} x2={0.8} y2={0} stroke="#94a3b8" strokeWidth={0.05} strokeDasharray="0.1 0.06" />
      ) : id === 'autre' ? (
        <rect x={-0.8} y={-0.08} width={1.6} height={0.16} fill="#fef3c7" stroke="#b45309" strokeWidth={0.05} />
      ) : (
        <>
          <line x1={-0.8} y1={0} x2={-0.8} y2={0.8} stroke={id === 'porte_entree' ? '#7c2d12' : '#334155'} strokeWidth={id === 'porte_entree' ? 0.12 : 0.07} />
          <path d="M -0.8 0.8 A 1.6 1.6 0 0 0 0.8 0" fill="none" stroke="#334155" strokeWidth={0.04} strokeDasharray="0.08 0.05" />
        </>
      )}
    </svg>
  );
}

export function FurnitureLibrary() {
  const dossier = useActiveDossier();
  const levelId = useApp((s) => s.activeLevelId);
  const selection = useApp((s) => s.selection);
  const mutate = useApp((s) => s.mutate);
  const select = useApp((s) => s.select);
  const toast = useApp((s) => s.toast);
  const ed = useEditor();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set(['sejour']));
  const level = dossier?.plan.levels.find((l) => l.id === levelId);
  const selectedRoom = useMemo(() => {
    if (!level || !selection) return null;
    if (selection.kind === 'room') return level.rooms.find((r) => r.id === selection.id) ?? null;
    if (selection.kind === 'furniture') {
      const f = (level.furniture ?? []).find((x) => x.id === selection.id);
      return level.rooms.find((r) => r.id === f?.roomId) ?? null;
    }
    return null;
  }, [level, selection]);
  if (!dossier || !level) return null;
  const needle = q.trim().toLowerCase();
  const models = FURNITURE_MODELS.filter((m) => !needle || m.name.toLowerCase().includes(needle) || FURNITURE_CATEGORY_LABELS[m.category].toLowerCase().includes(needle));
  const groups = (Object.keys(FURNITURE_CATEGORY_LABELS) as FurnitureCategory[]).map((c) => ({ c, items: models.filter((m) => m.category === c) })).filter((g) => g.items.length);
  const joinery = JOINERY_MODELS.filter((m) => !needle || m.name.toLowerCase().includes(needle) || 'menuiserie'.includes(needle));

  const add = (modelId: string) => {
    if (selectedRoom) {
      let id = '';
      mutate((d) => void (id = addFurniture(findLevel(d, level.id), modelId, { room: selectedRoom })?.id ?? ''));
      if (id) {
        select({ kind: 'furniture', id });
        toast('success', `${getFurnitureModel(modelId)?.name} ajouté(e) dans « ${selectedRoom.name} ».`);
      }
    } else {
      useEditor.getState().set({ tool: 'furniture', armedFurnitureId: modelId, openingPreset: null });
      toast('info', `Cliquez dans une pièce du plan pour poser : ${getFurnitureModel(modelId)?.name}.`);
    }
  };

  return (
    <PanelSection title="Mobilier et menuiseries">
      <div className="flex flex-col gap-2" data-testid="furniture-library">
        <div className="flex flex-wrap gap-1.5">
          <Toggle checked={ed.show2dFurniture} onChange={(v) => ed.set({ show2dFurniture: v })} label="Afficher le mobilier" />
          <Toggle checked={ed.lockStructure} onChange={(v) => ed.set({ lockStructure: v })} label="Verrouiller la structure" />
        </div>
        {ed.lockStructure && (
          <p className="flex items-center gap-1 text-[11px] text-amber-700">
            <Lock size={11} /> Murs, pièces et menuiseries verrouillés : seul le mobilier se déplace.
          </p>
        )}
        {!ed.lockStructure && (
          <p className="flex items-center gap-1 text-[11px] text-slate-500">
            <Unlock size={11} /> Structure modifiable.
          </p>
        )}
        <Button
          size="sm"
          icon={<Wand2 size={13} />}
          onClick={() => {
            let n = 0;
            mutate((d) => void (n = furnishEmptyRooms(d.plan.levels, findLevel(d, level.id))));
            toast(n ? 'success' : 'info', n ? `${n} objet(s) posé(s) dans les pièces vides.` : 'Toutes les pièces de ce niveau sont déjà aménagées.');
          }}
          data-testid="furnish-empty"
        >
          Aménager les pièces vides
        </Button>
        <div className="relative">
          <Search size={13} className="absolute top-2 left-2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un objet…" className="h-8 w-full rounded-md border border-slate-200 pr-2 pl-7 text-xs" aria-label="Rechercher un objet" />
        </div>
        <p className="text-[11px] text-slate-500">
          {selectedRoom ? (
            <>
              Ajout dans <strong>{selectedRoom.name}</strong> (emplacement libre).
            </>
          ) : (
            'Sélectionnez une pièce pour y ajouter un objet, ou choisissez un objet puis cliquez sur le plan.'
          )}
        </p>
        {groups.map(({ c, items }) => {
          const isOpen = !!needle || open.has(c);
          return (
            <div key={c} className="rounded border border-slate-100">
              <button
                className="flex w-full items-center justify-between px-2 py-1 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setOpen((s) => {
                  const n = new Set(s);
                  if (n.has(c)) n.delete(c);
                  else n.add(c);
                  return n;
                })}
              >
                {FURNITURE_CATEGORY_LABELS[c]} <span className="font-normal text-slate-400">{items.length}</span>
              </button>
              {isOpen && (
                <div className="grid grid-cols-2 gap-1 p-1">
                  {items.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => add(m.id)}
                      className={cx(
                        'flex flex-col items-center gap-0.5 rounded border px-1 py-1 text-center text-[10px] leading-tight hover:border-brand-300 hover:bg-brand-50/40',
                        ed.tool === 'furniture' && ed.armedFurnitureId === m.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white',
                      )}
                      title={`${m.name} – ${formatNumber(m.w)} × ${formatNumber(m.d)} m`}
                      data-testid={`library-${m.id}`}
                    >
                      <FurnitureThumb modelId={m.id} size={38} />
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {joinery.length > 0 && (
          <div className="rounded border border-slate-100">
            <div className="px-2 py-1 text-xs font-semibold text-slate-700">Menuiseries</div>
            <div className="grid grid-cols-2 gap-1 p-1">
              {joinery.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    useEditor.getState().set({ tool: m.type, openingPreset: m.id, armedFurnitureId: null });
                    toast('info', `Cliquez sur un mur pour placer : ${m.name.toLowerCase()}.`);
                  }}
                  className={cx(
                    'flex flex-col items-center gap-0.5 rounded border px-1 py-1 text-center text-[10px] leading-tight hover:border-brand-300',
                    ed.openingPreset === m.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white',
                  )}
                  data-testid={`joinery-model-${m.id}`}
                >
                  <JoineryThumb id={m.id} />
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </PanelSection>
  );
}
