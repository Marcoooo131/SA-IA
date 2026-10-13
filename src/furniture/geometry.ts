import type { FurnitureItem, Room, RoomSide } from '@/domain/types';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Retrait intérieur appliqué aux pièces : le mobilier ne mord jamais sur l'épaisseur des murs. */
export const WALL_INSET = 0.1;

/** Orientation (degrés) d'un objet adossé à un côté de pièce, face avant tournée vers l'intérieur. */
export const SIDE_ROTATION: Record<RoomSide, number> = { N: 0, E: 90, S: 180, W: 270 };

export function normRotation(deg: number): number {
  return ((Math.round(deg) % 360) + 360) % 360;
}

/** Emprise au sol (rectangle englobant aligné sur les axes) d'un objet orienté. */
export function footprint(item: Pick<FurnitureItem, 'x' | 'y' | 'w' | 'd' | 'rotation'>): Rect {
  const a = (normRotation(item.rotation) * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const hw = (item.w * c + item.d * s) / 2;
  const hd = (item.w * s + item.d * c) / 2;
  return { x0: item.x - hw, y0: item.y - hd, x1: item.x + hw, y1: item.y + hd };
}

export function innerRect(room: Room, inset = WALL_INSET): Rect {
  return { x0: room.x + inset, y0: room.y + inset, x1: room.x + room.w - inset, y1: room.y + room.h - inset };
}

export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return a.x0 < b.x1 + gap - 1e-6 && b.x0 < a.x1 + gap - 1e-6 && a.y0 < b.y1 + gap - 1e-6 && b.y0 < a.y1 + gap - 1e-6;
}

export function rectInside(inner: Rect, outer: Rect, tol = 1e-6): boolean {
  return inner.x0 >= outer.x0 - tol && inner.y0 >= outer.y0 - tol && inner.x1 <= outer.x1 + tol && inner.y1 <= outer.y1 + tol;
}

/** Passage du repère local de l'objet (x à droite, y vers l'avant) au repère du plan. */
export function localToWorld(item: Pick<FurnitureItem, 'x' | 'y' | 'rotation'>, lx: number, ly: number): { x: number; y: number } {
  const a = (item.rotation * Math.PI) / 180;
  return { x: item.x + lx * Math.cos(a) - ly * Math.sin(a), y: item.y + lx * Math.sin(a) + ly * Math.cos(a) };
}
