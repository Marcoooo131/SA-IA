import type { Level, Opening, OpeningHost, Plan, Point, Room, RoomSide, Wall } from '@/domain/types';

export const EXTERIOR_WALL_THICKNESS = 0.2;
export const INTERIOR_WALL_THICKNESS = 0.1;
const EPS = 1e-6;

export interface Segment {
  a: Point;
  b: Point;
}

export function roomArea(room: Room): number {
  return Math.max(0, room.w) * Math.max(0, room.h);
}

export function levelArea(level: Level): number {
  return level.rooms.reduce((sum, r) => sum + roomArea(r), 0);
}

export function levelHabitableArea(level: Level): number {
  return level.rooms.filter((r) => r.type !== 'garage' && r.type !== 'veranda').reduce((sum, r) => sum + roomArea(r), 0);
}

export function planArea(plan: Plan): number {
  return plan.levels.reduce((s, l) => s + levelArea(l), 0);
}

export function segmentLength(s: Segment): number {
  return Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
}

export function roomSideSegment(room: Room, side: RoomSide): Segment {
  const { x, y, w, h } = room;
  switch (side) {
    case 'N':
      return { a: { x, y }, b: { x: x + w, y } };
    case 'S':
      return { a: { x, y: y + h }, b: { x: x + w, y: y + h } };
    case 'W':
      return { a: { x, y }, b: { x, y: y + h } };
    case 'E':
      return { a: { x: x + w, y }, b: { x: x + w, y: y + h } };
  }
}

/** Normale sortante d'un côté de pièce. */
export function sideNormal(side: RoomSide): Point {
  switch (side) {
    case 'N':
      return { x: 0, y: -1 };
    case 'S':
      return { x: 0, y: 1 };
    case 'W':
      return { x: -1, y: 0 };
    case 'E':
      return { x: 1, y: 0 };
  }
}

export function hostSegment(level: Level, host: OpeningHost): Segment | null {
  if (host.kind === 'room') {
    const room = level.rooms.find((r) => r.id === host.roomId);
    return room ? roomSideSegment(room, host.side) : null;
  }
  const wall = level.walls.find((w) => w.id === host.wallId);
  return wall ? { a: wall.a, b: wall.b } : null;
}

export interface OpeningPlacement {
  center: Point;
  start: Point;
  end: Point;
  /** Angle du segment hôte (radians). */
  angle: number;
  hostLength: number;
}

export function openingPlacement(level: Level, opening: Opening): OpeningPlacement | null {
  const seg = hostSegment(level, opening.host);
  if (!seg) return null;
  const len = segmentLength(seg);
  if (len < EPS) return null;
  const ux = (seg.b.x - seg.a.x) / len;
  const uy = (seg.b.y - seg.a.y) / len;
  const half = Math.min(opening.width, len) / 2;
  const offset = clampOffset(opening.offset, Math.min(opening.width, len), len);
  const center = { x: seg.a.x + ux * offset, y: seg.a.y + uy * offset };
  return {
    center,
    start: { x: center.x - ux * half, y: center.y - uy * half },
    end: { x: center.x + ux * half, y: center.y + uy * half },
    angle: Math.atan2(uy, ux),
    hostLength: len,
  };
}

/** Garantit qu'une ouverture reste entièrement sur son segment. */
export function clampOffset(offset: number, width: number, hostLength: number): number {
  const half = width / 2;
  if (hostLength <= width) return hostLength / 2;
  return Math.min(hostLength - half, Math.max(half, offset));
}

export function projectOnSegment(p: Point, s: Segment): { t: number; distance: number; point: Point } {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 < EPS ? 0 : ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: s.a.x + dx * t, y: s.a.y + dy * t };
  return { t, distance: Math.hypot(p.x - point.x, p.y - point.y), point };
}

export interface HostCandidate {
  host: OpeningHost;
  offset: number;
  distance: number;
  segment: Segment;
}

/** Segment hôte le plus proche d'un point (côtés de pièces et murs libres). */
export function nearestHost(level: Level, p: Point, maxDistance = 0.6): HostCandidate | null {
  let best: HostCandidate | null = null;
  const consider = (host: OpeningHost, segment: Segment) => {
    const proj = projectOnSegment(p, segment);
    if (proj.distance > maxDistance) return;
    if (!best || proj.distance < best.distance - 1e-9) {
      best = { host, offset: proj.t * segmentLength(segment), distance: proj.distance, segment };
    }
  };
  for (const room of level.rooms) {
    for (const side of ['N', 'S', 'E', 'W'] as RoomSide[]) {
      consider({ kind: 'room', roomId: room.id, side }, roomSideSegment(room, side));
    }
  }
  for (const wall of level.walls) consider({ kind: 'wall', wallId: wall.id }, { a: wall.a, b: wall.b });
  return best;
}

export function pointInRoom(p: Point, room: Room, margin = 0): boolean {
  return (
    p.x >= room.x - margin && p.x <= room.x + room.w + margin && p.y >= room.y - margin && p.y <= room.y + room.h + margin
  );
}

export function roomAt(level: Level, p: Point): Room | undefined {
  // La plus petite pièce contenant le point (utile en cas de chevauchement).
  return level.rooms
    .filter((r) => pointInRoom(p, r))
    .sort((a, b) => roomArea(a) - roomArea(b))[0];
}

/**
 * Indique si un point situé sur un côté de pièce donne sur l'extérieur :
 * on regarde s'il existe une autre pièce juste de l'autre côté.
 */
export function isExteriorAt(level: Level, roomId: string, side: RoomSide, point: Point): boolean {
  const n = sideNormal(side);
  const probe = { x: point.x + n.x * 0.15, y: point.y + n.y * 0.15 };
  return !level.rooms.some((r) => r.id !== roomId && pointInRoom(probe, r));
}

export function isOpeningExteriorByGeometry(level: Level, opening: Opening): boolean {
  if (opening.host.kind !== 'room') return false;
  const placement = openingPlacement(level, opening);
  if (!placement) return false;
  return isExteriorAt(level, opening.host.roomId, opening.host.side, placement.center);
}

export function roomsOverlap(a: Room, b: Room, tolerance = 0.05): boolean {
  return (
    a.x + tolerance < b.x + b.w &&
    b.x + tolerance < a.x + a.w &&
    a.y + tolerance < b.y + b.h &&
    b.y + tolerance < a.y + a.h
  );
}

export function sharedEdgeLength(a: Room, b: Room, tolerance = 0.02): number {
  // Bord vertical commun
  if (Math.abs(a.x + a.w - b.x) < tolerance || Math.abs(b.x + b.w - a.x) < tolerance) {
    return Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  }
  if (Math.abs(a.y + a.h - b.y) < tolerance || Math.abs(b.y + b.h - a.y) < tolerance) {
    return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  }
  return 0;
}

export function adjacentRooms(level: Level, room: Room, minShared = 0.3): Room[] {
  return level.rooms.filter((r) => r.id !== room.id && sharedEdgeLength(room, r) >= minShared);
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function levelBounds(level: Level): Bounds | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of level.rooms) {
    xs.push(r.x, r.x + r.w);
    ys.push(r.y, r.y + r.h);
  }
  for (const w of level.walls) {
    xs.push(w.a.x, w.b.x);
    ys.push(w.a.y, w.b.y);
  }
  if (!xs.length) return null;
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function planBounds(plan: Plan): Bounds | null {
  const all = plan.levels.map(levelBounds).filter((b): b is Bounds => !!b);
  if (!all.length) return null;
  return {
    minX: Math.min(...all.map((b) => b.minX)),
    minY: Math.min(...all.map((b) => b.minY)),
    maxX: Math.max(...all.map((b) => b.maxX)),
    maxY: Math.max(...all.map((b) => b.maxY)),
  };
}

// ---------------------------------------------------------------------------
// Grille magnétique et alignement
// ---------------------------------------------------------------------------

export function snapValue(value: number, grid: number): number {
  if (grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

export function snapPoint(p: Point, grid: number): Point {
  return { x: snapValue(p.x, grid), y: snapValue(p.y, grid) };
}

/**
 * Aligne un rectangle sur les bords des autres pièces lorsqu'ils sont proches
 * (outil d'alignement magnétique). Retourne aussi les guides utilisés.
 */
export function alignRect(
  rect: { x: number; y: number; w: number; h: number },
  others: Room[],
  threshold: number,
  mode: 'move' | 'resize' = 'move',
): { rect: { x: number; y: number; w: number; h: number }; guidesX: number[]; guidesY: number[] } {
  const xs = others.flatMap((o) => [o.x, o.x + o.w]);
  const ys = others.flatMap((o) => [o.y, o.y + o.h]);
  const result = { ...rect };
  const guidesX: number[] = [];
  const guidesY: number[] = [];

  const best = (values: number[], candidates: number[]) => {
    let found: { delta: number; target: number } | null = null;
    for (const v of values) {
      for (const c of candidates) {
        const d = c - v;
        if (Math.abs(d) <= threshold && (!found || Math.abs(d) < Math.abs(found.delta))) found = { delta: d, target: c };
      }
    }
    return found;
  };

  if (mode === 'move') {
    const bx = best([rect.x, rect.x + rect.w], xs);
    if (bx) {
      result.x = rect.x + bx.delta;
      guidesX.push(bx.target);
    }
    const by = best([rect.y, rect.y + rect.h], ys);
    if (by) {
      result.y = rect.y + by.delta;
      guidesY.push(by.target);
    }
  } else {
    const bx = best([rect.x + rect.w], xs);
    if (bx) {
      result.w = Math.max(0.5, rect.w + bx.delta);
      guidesX.push(bx.target);
    }
    const by = best([rect.y + rect.h], ys);
    if (by) {
      result.h = Math.max(0.5, rect.h + by.delta);
      guidesY.push(by.target);
    }
  }
  return { rect: result, guidesX, guidesY };
}

// ---------------------------------------------------------------------------
// Génération des murs (utilisée par la 3D et l'export)
// ---------------------------------------------------------------------------

export interface WallCut {
  /** Distances le long du mur (m) */
  t0: number;
  t1: number;
  opening: Opening;
}

export interface WallSegment {
  key: string;
  a: Point;
  b: Point;
  thickness: number;
  exterior: boolean;
  source: 'room' | 'wall';
  cuts: WallCut[];
}

const keyOf = (v: number) => Math.round(v * 100) / 100;

interface Edge {
  start: number;
  end: number;
  /** côté de la ligne où se trouve la pièce : -1 = avant (y ou x plus petit), +1 = après */
  side: -1 | 1;
}

function mergeLine(edges: Edge[]): { start: number; end: number; exterior: boolean }[] {
  const points = Array.from(new Set(edges.flatMap((e) => [keyOf(e.start), keyOf(e.end)]))).sort((a, b) => a - b);
  const pieces: { start: number; end: number; exterior: boolean }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const s = points[i];
    const e = points[i + 1];
    if (e - s < 0.005) continue;
    const mid = (s + e) / 2;
    const covering = edges.filter((ed) => ed.start - 1e-4 <= mid && ed.end + 1e-4 >= mid);
    if (!covering.length) continue;
    const before = covering.some((c) => c.side === -1);
    const after = covering.some((c) => c.side === 1);
    const exterior = !(before && after);
    const last = pieces[pieces.length - 1];
    if (last && Math.abs(last.end - s) < 1e-4 && last.exterior === exterior) last.end = e;
    else pieces.push({ start: s, end: e, exterior });
  }
  return pieces;
}

function collinearCuts(level: Level, seg: Segment): WallCut[] {
  const len = segmentLength(seg);
  if (len < EPS) return [];
  const ux = (seg.b.x - seg.a.x) / len;
  const uy = (seg.b.y - seg.a.y) / len;
  const cuts: WallCut[] = [];
  for (const opening of level.openings) {
    const pl = openingPlacement(level, opening);
    if (!pl) continue;
    // distance perpendiculaire du centre à la ligne du mur
    const px = pl.center.x - seg.a.x;
    const py = pl.center.y - seg.a.y;
    const perp = Math.abs(px * uy - py * ux);
    if (perp > 0.05) continue;
    // colinéarité
    const cross = Math.abs(Math.cos(pl.angle) * uy - Math.sin(pl.angle) * ux);
    if (cross > 0.05) continue;
    const ts = (pl.start.x - seg.a.x) * ux + (pl.start.y - seg.a.y) * uy;
    const te = (pl.end.x - seg.a.x) * ux + (pl.end.y - seg.a.y) * uy;
    const t0 = Math.max(0, Math.min(ts, te));
    const t1 = Math.min(len, Math.max(ts, te));
    if (t1 - t0 < 0.05) continue;
    if (cuts.some((c) => c.t0 < t1 - 0.01 && t0 < c.t1 - 0.01)) continue; // doublon déjà découpé
    cuts.push({ t0, t1, opening });
  }
  return cuts.sort((a, b) => a.t0 - b.t0);
}

export function buildWallSegments(level: Level): WallSegment[] {
  const horizontal = new Map<number, Edge[]>();
  const vertical = new Map<number, Edge[]>();
  const push = (map: Map<number, Edge[]>, k: number, e: Edge) => {
    const list = map.get(k) ?? [];
    list.push(e);
    map.set(k, list);
  };
  for (const r of level.rooms) {
    if (r.w <= 0 || r.h <= 0) continue;
    // Côté nord : la pièce est « après » la ligne (y plus grand)
    push(horizontal, keyOf(r.y), { start: r.x, end: r.x + r.w, side: 1 });
    push(horizontal, keyOf(r.y + r.h), { start: r.x, end: r.x + r.w, side: -1 });
    push(vertical, keyOf(r.x), { start: r.y, end: r.y + r.h, side: 1 });
    push(vertical, keyOf(r.x + r.w), { start: r.y, end: r.y + r.h, side: -1 });
  }
  const segments: WallSegment[] = [];
  for (const [y, edges] of horizontal) {
    for (const piece of mergeLine(edges)) {
      const seg = { a: { x: piece.start, y }, b: { x: piece.end, y } };
      segments.push({
        key: `h:${y}:${piece.start}`,
        ...seg,
        thickness: piece.exterior ? EXTERIOR_WALL_THICKNESS : INTERIOR_WALL_THICKNESS,
        exterior: piece.exterior,
        source: 'room',
        cuts: collinearCuts(level, seg),
      });
    }
  }
  for (const [x, edges] of vertical) {
    for (const piece of mergeLine(edges)) {
      const seg = { a: { x, y: piece.start }, b: { x, y: piece.end } };
      segments.push({
        key: `v:${x}:${piece.start}`,
        ...seg,
        thickness: piece.exterior ? EXTERIOR_WALL_THICKNESS : INTERIOR_WALL_THICKNESS,
        exterior: piece.exterior,
        source: 'room',
        cuts: collinearCuts(level, seg),
      });
    }
  }
  for (const w of level.walls) {
    segments.push({
      key: `w:${w.id}`,
      a: w.a,
      b: w.b,
      thickness: w.thickness,
      exterior: false,
      source: 'wall',
      cuts: collinearCuts(level, { a: w.a, b: w.b }),
    });
  }
  return segments;
}

// ---------------------------------------------------------------------------
// Contrôles de cohérence
// ---------------------------------------------------------------------------

/** Ouvertures superposées (même emplacement physique saisi deux fois). */
export function findDuplicateOpenings(level: Level): [Opening, Opening][] {
  const placed = level.openings
    .map((o) => ({ o, p: openingPlacement(level, o) }))
    .filter((x): x is { o: Opening; p: OpeningPlacement } => !!x.p);
  const dups: [Opening, Opening][] = [];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const A = placed[i];
      const B = placed[j];
      const cross = Math.abs(Math.sin(A.p.angle - B.p.angle));
      if (cross > 0.05) continue;
      const ux = Math.cos(A.p.angle);
      const uy = Math.sin(A.p.angle);
      const px = B.p.center.x - A.p.center.x;
      const py = B.p.center.y - A.p.center.y;
      if (Math.abs(px * uy - py * ux) > 0.1) continue;
      const along = Math.abs(px * ux + py * uy);
      if (along < (A.o.width + B.o.width) / 2 - 0.05) dups.push([A.o, B.o]);
    }
  }
  return dups;
}

export function nextOpeningCode(plan: Plan, level: Level): string {
  const prefix = level.index === 0 ? 'RDC' : `R${level.index}`;
  const used = new Set(plan.levels.flatMap((l) => l.openings.map((o) => o.code)));
  let n = 1;
  while (used.has(`${prefix}-O${String(n).padStart(2, '0')}`)) n++;
  return `${prefix}-O${String(n).padStart(2, '0')}`;
}

export function wallLength(w: Wall): number {
  return Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
}
