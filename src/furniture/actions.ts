import type { FurnitureItem, Level, Point, Room } from '@/domain/types';
import { roomAt } from '@/plan/geometry';
import { uid } from '@/lib/id';
import { getFurnitureModel, variantDims } from './models';
import { findSpot, furnishOptions, furnishRoom } from './placement';
import { normRotation } from './geometry';

/**
 * Modifications du mobilier. Elles ne touchent jamais la structure du logement
 * (pièces, murs, menuiseries) ni l'audit.
 */

function list(level: Level): FurnitureItem[] {
  if (!level.furniture) level.furniture = [];
  return level.furniture;
}

/** Ajoute un objet de la bibliothèque : au point cliqué, ou à un emplacement libre de la pièce. */
export function addFurniture(level: Level, modelId: string, opts: { at?: Point; room?: Room | null; variant?: string } = {}): FurnitureItem | null {
  const model = getFurnitureModel(modelId);
  if (!model) return null;
  const variant = opts.variant ?? model.variants?.[0]?.id;
  const dims = variantDims(model, variant);
  const room = opts.room ?? (opts.at ? roomAt(level, opts.at) : undefined) ?? null;
  let pos: { x: number; y: number; rotation: number };
  if (opts.at) pos = { x: opts.at.x, y: opts.at.y, rotation: 0 };
  else if (room) pos = findSpot(level, room, modelId, variant);
  else return null;
  const item: FurnitureItem = { id: uid('fur'), modelId, roomId: room?.id ?? null, x: pos.x, y: pos.y, rotation: pos.rotation, w: dims.w, d: dims.d, h: dims.h, variant, origin: 'manuel' };
  list(level).push(item);
  return item;
}

export function findFurniture(level: Level, id: string): FurnitureItem | undefined {
  return (level.furniture ?? []).find((f) => f.id === id);
}

/** Déplace un objet ; sa pièce de rattachement suit la position. */
export function moveFurniture(level: Level, id: string, x: number, y: number) {
  const f = findFurniture(level, id);
  if (!f) return;
  f.x = Math.round(x * 1000) / 1000;
  f.y = Math.round(y * 1000) / 1000;
  f.roomId = roomAt(level, { x: f.x, y: f.y })?.id ?? null;
  f.origin = 'manuel';
}

export function rotateFurniture(level: Level, id: string, delta: number) {
  const f = findFurniture(level, id);
  if (!f) return;
  f.rotation = normRotation(f.rotation + delta);
  f.origin = 'manuel';
}

/** Applique une variante (dimensions de la variante). */
export function setFurnitureVariant(level: Level, id: string, variant: string) {
  const f = findFurniture(level, id);
  const model = f && getFurnitureModel(f.modelId);
  if (!f || !model) return;
  const dims = variantDims(model, variant);
  Object.assign(f, { variant, w: dims.w, d: dims.d, h: dims.h, origin: 'manuel' as const });
}

export function updateFurniture(level: Level, id: string, patch: Partial<Pick<FurnitureItem, 'x' | 'y' | 'w' | 'd' | 'h' | 'color' | 'rotation'>>) {
  const f = findFurniture(level, id);
  if (!f) return;
  Object.assign(f, patch, { origin: 'manuel' as const });
  if (patch.rotation !== undefined) f.rotation = normRotation(patch.rotation);
  if (patch.x !== undefined || patch.y !== undefined) f.roomId = roomAt(level, { x: f.x, y: f.y })?.id ?? null;
}

export function removeFurniture(level: Level, id: string) {
  level.furniture = (level.furniture ?? []).filter((f) => f.id !== id);
}

export function duplicateFurniture(level: Level, id: string): FurnitureItem | null {
  const f = findFurniture(level, id);
  if (!f) return null;
  const copy: FurnitureItem = { ...structuredClone(f), id: uid('fur'), x: f.x + 0.3, y: f.y + 0.3, origin: 'manuel' };
  copy.roomId = roomAt(level, copy)?.id ?? f.roomId;
  list(level).push(copy);
  return copy;
}

/** Restaure le mobilier par défaut d'UNE pièce, sans toucher aux autres pièces. */
export function resetRoomFurniture(levels: Level[], level: Level, roomId: string): number {
  const room = level.rooms.find((r) => r.id === roomId);
  if (!room) return 0;
  const fresh = furnishRoom(level, room, furnishOptions(levels));
  level.furniture = [...(level.furniture ?? []).filter((f) => f.roomId !== roomId), ...fresh];
  return fresh.length;
}

/** Aménage automatiquement les pièces sans mobilier (plans dessinés ou importés). */
export function furnishEmptyRooms(levels: Level[], level: Level): number {
  const opts = furnishOptions(levels);
  const used = new Set((level.furniture ?? []).map((f) => f.roomId));
  let n = 0;
  for (const r of level.rooms) {
    if (used.has(r.id)) continue;
    const items = furnishRoom(level, r, opts);
    list(level).push(...items);
    n += items.length;
  }
  return n;
}

/** Déplace le mobilier d'une pièce avec elle. */
export function translateRoomFurniture(level: Level, roomId: string, dx: number, dy: number) {
  for (const f of level.furniture ?? []) {
    if (f.roomId !== roomId) continue;
    f.x += dx;
    f.y += dy;
  }
}
