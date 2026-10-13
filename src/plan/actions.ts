import type { Level, Opening, OpeningType, PlacedDevice, Plan, Point, Room, RoomType } from '@/domain/types';
import { OPENING_DEFAULT_WIDTH, ROOM_TYPE_LABELS } from '@/domain/labels';
import { uid } from '@/lib/id';
import { clampOffset, isExteriorAt, nearestHost, nextOpeningCode, projectOnSegment, roomsOverlap, segmentLength, hostSegment } from './geometry';

/**
 * Opérations d'édition du plan, appliquées sur un brouillon (copie) du dossier.
 * Elles sont pures vis-à-vis de l'interface et testées unitairement.
 */

export interface Draft {
  plan: Plan;
  devices: PlacedDevice[];
}

export function findLevel(draft: Draft, levelId: string): Level {
  const level = draft.plan.levels.find((l) => l.id === levelId);
  if (!level) throw new Error(`Niveau introuvable : ${levelId}`);
  return level;
}

export function defaultRoomName(level: Level, type: RoomType): string {
  const base = ROOM_TYPE_LABELS[type];
  const same = level.rooms.filter((r) => r.type === type).length;
  return same ? `${base} ${same + 1}` : base;
}

export function addRoom(level: Level, rect: { x: number; y: number; w: number; h: number }, type: RoomType, name?: string): Room {
  const room: Room = {
    id: uid('room'),
    name: name ?? defaultRoomName(level, type),
    type,
    x: rect.x,
    y: rect.y,
    w: Math.max(0.5, rect.w),
    h: Math.max(0.5, rect.h),
    openPlan: false,
  };
  level.rooms.push(room);
  return room;
}

/** Trouve un emplacement libre à droite des pièces existantes. */
export function freeSpot(level: Level, w: number, h: number): { x: number; y: number } {
  if (!level.rooms.length) return { x: 0, y: 0 };
  const maxX = Math.max(...level.rooms.map((r) => r.x + r.w));
  const minY = Math.min(...level.rooms.map((r) => r.y));
  const candidate = { id: 'tmp', name: '', type: 'autre' as const, x: maxX, y: minY, w, h, openPlan: false };
  while (level.rooms.some((r) => roomsOverlap(r, candidate))) candidate.y += h;
  return { x: candidate.x, y: candidate.y };
}

export function removeRoom(level: Level, roomId: string) {
  level.rooms = level.rooms.filter((r) => r.id !== roomId);
  level.openings = level.openings.filter((o) => !((o.host.kind === 'room' || o.host.kind === 'unplaced') && o.host.roomId === roomId));
}

export function removeWall(level: Level, wallId: string) {
  level.walls = level.walls.filter((w) => w.id !== wallId);
  level.openings = level.openings.filter((o) => !(o.host.kind === 'wall' && o.host.wallId === wallId));
}

export function removeOpening(draft: Draft, level: Level, openingId: string) {
  level.openings = level.openings.filter((o) => o.id !== openingId);
  // suggestion automatique non validée liée à l'ouverture : retirée (pas de détecteur orphelin) ;
  // équipement ajouté ou validé par le conseiller : conservé et simplement détaché
  draft.devices = draft.devices
    .filter((d) => !(d.openingId === openingId && d.origin === 'suggere' && !d.validated))
    .map((d) => (d.openingId === openingId ? { ...d, openingId: undefined } : d));
}

export function addWall(level: Level, a: Point, b: Point, thickness = 0.1) {
  const wall = { id: uid('wall'), a, b, thickness };
  level.walls.push(wall);
  return wall;
}

/**
 * Ajoute une ouverture sur le segment le plus proche du point cliqué.
 * L'indicateur « donne sur l'extérieur » est déduit de la géométrie (modifiable ensuite).
 */
export function addOpeningAt(plan: Plan, level: Level, type: OpeningType, p: Point, maxDistance = 0.6): Opening | null {
  const cand = nearestHost(level, p, maxDistance);
  if (!cand) return null;
  const len = segmentLength(cand.segment);
  const width = Math.min(OPENING_DEFAULT_WIDTH[type], Math.max(0.4, len - 0.1));
  const offset = clampOffset(cand.offset, width, len);
  let exterior = false;
  if (type !== 'porte_interieure' && type !== 'passage' && cand.host.kind === 'room') {
    const proj = projectOnSegment(p, cand.segment);
    exterior = isExteriorAt(level, cand.host.roomId, cand.host.side, proj.point);
  }
  const opening: Opening = {
    id: uid('op'),
    code: nextOpeningCode(plan, level),
    type,
    host: cand.host,
    offset,
    width,
    exterior,
    sectional: type === 'porte_garage',
  };
  level.openings.push(opening);
  return opening;
}

export function moveOpeningTo(level: Level, opening: Opening, p: Point) {
  const seg = hostSegment(level, opening.host);
  if (!seg) return;
  const proj = projectOnSegment(p, seg);
  opening.offset = clampOffset(proj.t * segmentLength(seg), opening.width, segmentLength(seg));
}

export function addLevel(plan: Plan): Level {
  const index = plan.levels.length ? Math.max(...plan.levels.map((l) => l.index)) + 1 : 0;
  const level: Level = {
    id: uid('lvl'),
    name: index === 0 ? 'Rez-de-chaussée' : `Étage (R+${index})`,
    index,
    height: 2.5,
    rooms: [],
    walls: [],
    openings: [],
    background: null,
  };
  plan.levels.push(level);
  return level;
}

export function removeLevel(draft: Draft, levelId: string) {
  draft.plan.levels = draft.plan.levels.filter((l) => l.id !== levelId);
  draft.devices = draft.devices.filter((d) => d.levelId !== levelId);
  // réindexation continue
  [...draft.plan.levels].sort((a, b) => a.index - b.index).forEach((l, i) => (l.index = i));
}

/** Copie l'emprise des pièces d'un niveau vers un nouveau niveau (aide à la saisie d'un étage). */
export function copyFootprint(from: Level, to: Level) {
  for (const r of from.rooms) addRoom(to, r, r.type, r.name);
}

/**
 * Redimensionne une pièce par une poignée. Les dimensions minimales sont garanties.
 */
export function resizeRoom(
  room: Room,
  start: Room,
  handle: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w',
  dx: number,
  dy: number,
  snap: (v: number) => number,
) {
  const MIN = 0.5;
  let { x, y, w, h } = start;
  const right = start.x + start.w;
  const bottom = start.y + start.h;
  if (handle.includes('w')) {
    x = Math.min(snap(start.x + dx), right - MIN);
    w = right - x;
  }
  if (handle.includes('e')) w = Math.max(MIN, snap(right + dx) - start.x);
  if (handle.includes('n')) {
    y = Math.min(snap(start.y + dy), bottom - MIN);
    h = bottom - y;
  }
  if (handle.includes('s')) h = Math.max(MIN, snap(bottom + dy) - start.y);
  Object.assign(room, { x, y, w, h });
}

/**
 * Calibre le fond importé : `measured` (m, à l'échelle actuelle) doit valoir `real` (m).
 * L'image est redimensionnée autour du premier point cliqué.
 */
export function calibrateBackground(level: Level, p1: Point, p2: Point, real: number) {
  const bg = level.background;
  if (!bg) throw new Error('Aucun fond importé sur ce niveau.');
  const measured = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (measured < 0.01) throw new Error('Les deux points sont trop proches.');
  if (!(real > 0)) throw new Error('La dimension réelle doit être positive.');
  const f = real / measured;
  bg.x = p1.x + (bg.x - p1.x) * f;
  bg.y = p1.y + (bg.y - p1.y) * f;
  bg.width *= f;
  bg.calibrated = true;
  return f;
}
