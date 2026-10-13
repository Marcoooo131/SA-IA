import type { FurnitureItem, Level, Opening, Room, RoomSide } from '@/domain/types';
import { openingPlacement, roomArea } from '@/plan/geometry';
import { getFurnitureModel, variantDims } from './models';
import { SIDE_ROTATION, footprint, innerRect, rectInside, rectsOverlap, type Rect } from './geometry';

/**
 * Placement automatique et DÉTERMINISTE du mobilier générique.
 *
 * Pour chaque pièce : zones à préserver (débattement des portes, passages, allèges des
 * fenêtres), puis recette par type de pièce (séjour, cuisine, chambre…). Chaque objet est
 * testé à des positions candidates dans un ordre fixe : même plan => même mobilier.
 * Un objet qui ne trouve pas de place est retiré (objets secondaires) ou remplacé par une
 * variante plus petite ; les dimensions du logement ne sont jamais modifiées.
 */

const SIDES: RoomSide[] = ['N', 'E', 'S', 'W'];
const OPPOSITE: Record<RoomSide, RoomSide> = { N: 'S', S: 'N', E: 'W', W: 'E' };

interface Zone {
  rect: Rect;
  side: RoomSide;
  kind: 'porte' | 'fenetre';
}

interface Placed {
  item: FurnitureItem;
  rect: Rect;
  layer: 'sol' | 'haut';
}

interface Ctx {
  level: Level;
  room: Room;
  inner: Rect;
  zones: Zone[];
  placed: Placed[];
  seq: number;
  /** Logement sans chambre (studio) : le couchage va dans la pièce de vie. */
  studio: boolean;
}

/** Côté de la pièce sur lequel se trouve une ouverture (ou null). */
function openingSide(room: Room, o: Opening, level: Level): { side: RoomSide; a: number; b: number } | null {
  const pl = openingPlacement(level, o);
  if (!pl) return null;
  const tol = 0.08;
  const horizontal = Math.abs(pl.start.y - pl.end.y) < 1e-6;
  if (horizontal) {
    const y = pl.start.y;
    const a = Math.max(Math.min(pl.start.x, pl.end.x), room.x);
    const b = Math.min(Math.max(pl.start.x, pl.end.x), room.x + room.w);
    if (b - a < 0.05) return null;
    if (Math.abs(y - room.y) < tol) return { side: 'N', a, b };
    if (Math.abs(y - (room.y + room.h)) < tol) return { side: 'S', a, b };
    return null;
  }
  const x = pl.start.x;
  const a = Math.max(Math.min(pl.start.y, pl.end.y), room.y);
  const b = Math.min(Math.max(pl.start.y, pl.end.y), room.y + room.h);
  if (b - a < 0.05) return null;
  if (Math.abs(x - room.x) < tol) return { side: 'W', a, b };
  if (Math.abs(x - (room.x + room.w)) < tol) return { side: 'E', a, b };
  return null;
}

/** Profondeur à préserver devant une ouverture, côté intérieur de la pièce. */
function clearance(o: Opening, room: Room): { depth: number; kind: Zone['kind'] } {
  const hostedHere = (o.host.kind === 'room' && o.host.roomId === room.id) || o.host.kind === 'wall';
  switch (o.type) {
    case 'fenetre':
      return { depth: 0.5, kind: 'fenetre' };
    case 'porte_garage':
      // porte sectionnelle / basculante : faible débattement intérieur
      return { depth: 0.3, kind: 'porte' };
    case 'passage':
    case 'baie':
      return { depth: 0.9, kind: 'porte' };
    case 'porte_fenetre':
      return { depth: Math.max(0.9, (o.leaves === 2 ? o.width / 2 : o.width) + 0.15), kind: 'porte' };
    case 'autre':
      return { depth: 0.6, kind: 'porte' };
    default:
      return { depth: hostedHere ? o.width + 0.15 : 0.8, kind: 'porte' };
  }
}

export function roomZones(level: Level, room: Room): Zone[] {
  const zones: Zone[] = [];
  for (const o of level.openings) {
    if (o.host.kind === 'unplaced') continue;
    const s = openingSide(room, o, level);
    if (!s) continue;
    const { depth, kind } = clearance(o, room);
    const a = s.a - 0.1;
    const b = s.b + 0.1;
    let rect: Rect;
    switch (s.side) {
      case 'N':
        rect = { x0: a, x1: b, y0: room.y, y1: room.y + depth };
        break;
      case 'S':
        rect = { x0: a, x1: b, y0: room.y + room.h - depth, y1: room.y + room.h };
        break;
      case 'W':
        rect = { x0: room.x, x1: room.x + depth, y0: a, y1: b };
        break;
      case 'E':
        rect = { x0: room.x + room.w - depth, x1: room.x + room.w, y0: a, y1: b };
        break;
    }
    zones.push({ rect, side: s.side, kind });
  }
  return zones;
}

// ---------------------------------------------------------------------------
// Primitives de placement
// ---------------------------------------------------------------------------

interface Candidate {
  modelId: string;
  variant?: string;
  x: number;
  y: number;
  rotation: number;
  w?: number;
  d?: number;
}

function build(ctx: Ctx, c: Candidate): Placed | null {
  const model = getFurnitureModel(c.modelId);
  if (!model) return null;
  const dims = variantDims(model, c.variant);
  const item: FurnitureItem = {
    id: `fur_${ctx.room.id}_${ctx.seq}`,
    modelId: model.id,
    roomId: ctx.room.id,
    x: round(c.x),
    y: round(c.y),
    rotation: c.rotation,
    w: c.w ?? dims.w,
    d: c.d ?? dims.d,
    h: dims.h,
    variant: c.variant,
    origin: 'genere',
  };
  return { item, rect: footprint(item), layer: model.layer };
}

const round = (v: number) => Math.round(v * 1000) / 1000;

function fits(ctx: Ctx, p: Placed, opts: { gap?: number; ignore?: Placed[] } = {}): boolean {
  if (!rectInside(p.rect, ctx.inner)) return false;
  const model = getFurnitureModel(p.item.modelId)!;
  const tall = p.layer === 'haut' || model.h > 1.2;
  for (const z of ctx.zones) {
    if (z.kind === 'porte' && rectsOverlap(p.rect, z.rect)) return false;
    if (z.kind === 'fenetre' && tall && rectsOverlap(p.rect, z.rect)) return false;
  }
  for (const q of ctx.placed) {
    if (q.layer !== p.layer || opts.ignore?.includes(q)) continue;
    if (rectsOverlap(p.rect, q.rect, opts.gap ?? 0.02)) return false;
  }
  return true;
}

function commit(ctx: Ctx, p: Placed): FurnitureItem {
  ctx.placed.push(p);
  ctx.seq++;
  return p.item;
}

function sideRange(ctx: Ctx, side: RoomSide): [number, number] {
  return side === 'N' || side === 'S' ? [ctx.inner.x0, ctx.inner.x1] : [ctx.inner.y0, ctx.inner.y1];
}

function sideLength(ctx: Ctx, side: RoomSide): number {
  const [a, b] = sideRange(ctx, side);
  return b - a;
}

/** Profondeur intérieure perpendiculaire à un côté. */
function depthFrom(ctx: Ctx, side: RoomSide): number {
  return side === 'N' || side === 'S' ? ctx.inner.y1 - ctx.inner.y0 : ctx.inner.x1 - ctx.inner.x0;
}

/** Objet adossé au côté `side` (gap : distance au mur), centré à `along` le long du côté. */
function against(modelId: string, side: RoomSide, along: number, ctx: Ctx, opts: { variant?: string; gap?: number; w?: number; d?: number } = {}): Candidate {
  const model = getFurnitureModel(modelId)!;
  const dims = variantDims(model, opts.variant);
  const d = opts.d ?? dims.d;
  const gap = opts.gap ?? 0;
  const { inner } = ctx;
  const rotation = SIDE_ROTATION[side];
  switch (side) {
    case 'N':
      return { modelId, variant: opts.variant, x: along, y: inner.y0 + gap + d / 2, rotation, w: opts.w, d: opts.d };
    case 'S':
      return { modelId, variant: opts.variant, x: along, y: inner.y1 - gap - d / 2, rotation, w: opts.w, d: opts.d };
    case 'W':
      return { modelId, variant: opts.variant, x: inner.x0 + gap + d / 2, y: along, rotation, w: opts.w, d: opts.d };
    case 'E':
      return { modelId, variant: opts.variant, x: inner.x1 - gap - d / 2, y: along, rotation, w: opts.w, d: opts.d };
  }
}

/** Positions candidates le long d'un côté, dans un ordre fixe. */
function alongPositions(ctx: Ctx, side: RoomSide, w: number, pref: 'centre' | 'debut' | 'fin' | number): number[] {
  const [a, b] = sideRange(ctx, side);
  const lo = a + w / 2;
  const hi = b - w / 2;
  if (hi < lo - 1e-6) return [];
  const step = 0.05;
  const out: number[] = [];
  if (pref === 'debut') for (let v = lo; v <= hi + 1e-6; v += step) out.push(v);
  else if (pref === 'fin') for (let v = hi; v >= lo - 1e-6; v -= step) out.push(v);
  else {
    const start = Math.min(hi, Math.max(lo, pref === 'centre' ? (a + b) / 2 : pref));
    out.push(start);
    for (let k = 1; k < 400; k++) {
      const up = start + k * step;
      const down = start - k * step;
      if (up > hi + 1e-6 && down < lo - 1e-6) break;
      if (up <= hi + 1e-6) out.push(up);
      if (down >= lo - 1e-6) out.push(down);
    }
  }
  return out;
}

function placeAgainst(
  ctx: Ctx,
  modelId: string,
  sides: RoomSide[],
  opts: { variant?: string; pref?: 'centre' | 'debut' | 'fin'; gap?: number; w?: number; minDepth?: number } = {},
): FurnitureItem | null {
  const model = getFurnitureModel(modelId);
  if (!model) return null;
  const dims = variantDims(model, opts.variant);
  const w = opts.w ?? dims.w;
  for (const side of sides) {
    if (opts.minDepth && depthFrom(ctx, side) < opts.minDepth) continue;
    for (const along of alongPositions(ctx, side, w, opts.pref ?? 'centre')) {
      const p = build(ctx, against(modelId, side, along, ctx, opts));
      if (p && fits(ctx, p)) return commit(ctx, p);
    }
  }
  return null;
}

/** Placement libre (table à manger…) : position valide la plus proche d'un point cible. */
function placeFree(ctx: Ctx, modelId: string, opts: { variant?: string; rotations: number[]; target: { x: number; y: number }; gap?: number }): FurnitureItem | null {
  let best: { p: Placed; score: number } | null = null;
  const step = 0.1;
  for (const rotation of opts.rotations) {
    for (let x = ctx.inner.x0; x <= ctx.inner.x1 + 1e-6; x += step) {
      for (let y = ctx.inner.y0; y <= ctx.inner.y1 + 1e-6; y += step) {
        const p = build(ctx, { modelId, variant: opts.variant, x, y, rotation });
        if (!p || !fits(ctx, p, { gap: opts.gap ?? 0.45 })) continue;
        const score = Math.hypot(x - opts.target.x, y - opts.target.y);
        if (!best || score < best.score - 1e-9) best = { p, score };
      }
    }
  }
  return best ? commit(ctx, best.p) : null;
}

function snapshot(ctx: Ctx) {
  return { n: ctx.placed.length, seq: ctx.seq };
}
function restore(ctx: Ctx, s: { n: number; seq: number }) {
  ctx.placed.length = s.n;
  ctx.seq = s.seq;
}

function sideOfRotation(rotation: number): RoomSide {
  return SIDES.find((s) => SIDE_ROTATION[s] === rotation) ?? 'N';
}

function doorCover(ctx: Ctx, side: RoomSide): number {
  return ctx.zones.filter((z) => z.side === side && z.kind === 'porte').length;
}
function hasWindow(ctx: Ctx, side: RoomSide): boolean {
  return ctx.zones.some((z) => z.side === side && z.kind === 'fenetre');
}

/** Côtés triés : sans porte, puis sans fenêtre (si demandé), puis les plus longs. */
function sortedSides(ctx: Ctx, opts: { avoidWindows?: boolean; preferWindows?: boolean; exclude?: RoomSide[] } = {}): RoomSide[] {
  return SIDES.filter((s) => !opts.exclude?.includes(s))
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const score = (s: RoomSide) =>
        doorCover(ctx, s) * 10 + (opts.avoidWindows && hasWindow(ctx, s) ? 3 : 0) + (opts.preferWindows && !hasWindow(ctx, s) ? 3 : 0);
      return score(a.s) - score(b.s) || sideLength(ctx, b.s) - sideLength(ctx, a.s) || a.i - b.i;
    })
    .map((x) => x.s);
}

// ---------------------------------------------------------------------------
// Recettes par type de pièce
// ---------------------------------------------------------------------------

function livingRoom(ctx: Ctx) {
  const area = roomArea(ctx.room);
  // studio : la pièce de vie accueille aussi le couchage
  if (ctx.studio) {
    for (const v of ['140', '90']) {
      const dims = variantDims(getFurnitureModel('lit')!, v);
      if (placeAgainst(ctx, 'lit', sortedSides(ctx, { avoidWindows: true }), { variant: v, pref: 'debut', minDepth: dims.d + 0.6 })) break;
    }
  }
  let done = false;
  for (const tvSide of sortedSides(ctx, { avoidWindows: true })) {
    const opp = OPPOSITE[tvSide];
    const len = sideLength(ctx, tvSide);
    const tvVariant = len >= 2.6 ? '160' : '120';
    const sofaVariant = len >= 3.4 && area >= 22 ? '3p' : '2p';
    const tvDims = variantDims(getFurnitureModel('meuble_tv')!, tvVariant);
    const sofaDims = variantDims(getFurnitureModel('canape')!, sofaVariant);
    const depth = depthFrom(ctx, tvSide);
    // circulation + table basse entre le canapé et le meuble TV
    if (depth - tvDims.d - sofaDims.d < 1.5) continue;
    // distance de vision visée ≈ 2,6 m ; le canapé peut « flotter » dans les grandes pièces
    const ideal = Math.max(0, depth - tvDims.d - sofaDims.d - 2.6);
    const maxGap = depth - tvDims.d - sofaDims.d - 1.5;
    const gaps = [...new Set([ideal, ...Array.from({ length: 12 }, (_, k) => k * 0.3)].filter((g) => g <= maxGap + 1e-6).map((g) => round(g)))].sort(
      (a, b) => Math.abs(a - ideal) - Math.abs(b - ideal) || a - b,
    );
    for (const along of alongPositions(ctx, tvSide, tvDims.w, 'centre')) {
      const snap = snapshot(ctx);
      const tv = build(ctx, against('meuble_tv', tvSide, along, ctx, { variant: tvVariant }));
      if (!tv || !fits(ctx, tv)) continue;
      const tvItem = commit(ctx, tv);
      let sofaItem: FurnitureItem | null = null;
      search: for (const shift of [0, 0.3, -0.3, 0.6, -0.6]) {
        for (const gap of gaps) {
          const sofa = build(ctx, against('canape', opp, along + shift, ctx, { variant: sofaVariant, gap }));
          if (sofa && fits(ctx, sofa)) {
            sofaItem = commit(ctx, sofa);
            break search;
          }
        }
      }
      if (!sofaItem) {
        restore(ctx, snap);
        continue;
      }
      // table basse entre les deux, tournée comme le canapé
      const vertical = tvSide === 'N' || tvSide === 'S';
      const mid = vertical ? { x: sofaItem.x, y: (tvItem.y + sofaItem.y) / 2 } : { x: (tvItem.x + sofaItem.x) / 2, y: sofaItem.y };
      const tableW = Math.min(getFurnitureModel('table_basse')!.w, sofaDims.w - 0.6);
      for (const shift of [0, 0.3, -0.3, 0.6, -0.6]) {
        const at = vertical ? { x: mid.x + shift, y: mid.y } : { x: mid.x, y: mid.y + shift };
        const table = build(ctx, { modelId: 'table_basse', x: at.x, y: at.y, rotation: sofaItem.rotation, w: tableW });
        if (table && fits(ctx, table, { gap: 0.25 })) {
          commit(ctx, table);
          break;
        }
      }
      // téléviseur posé sur le meuble
      const tvSet = build(ctx, { modelId: 'televiseur', x: tvItem.x, y: tvItem.y, rotation: tvItem.rotation, variant: tvVariant === '160' ? '55' : '43' });
      if (tvSet && fits(ctx, tvSet)) commit(ctx, tvSet);
      // fauteuil à une extrémité du canapé, tourné vers la table basse
      if (area >= 18) {
        const r = (sofaItem.rotation * Math.PI) / 180;
        const offs = sofaDims.w / 2 + 0.55;
        for (const sgn of [1, -1]) {
          const c = { x: mid.x + Math.cos(r) * offs * sgn, y: mid.y + Math.sin(r) * offs * sgn };
          const rot = (sofaItem.rotation + (sgn > 0 ? 90 : 270)) % 360;
          const chair = build(ctx, { modelId: 'fauteuil', x: c.x, y: c.y, rotation: rot });
          if (chair && fits(ctx, chair, { gap: 0.1 })) {
            commit(ctx, chair);
            break;
          }
        }
      }
      done = true;
      break;
    }
    if (done) break;
  }
  // pièce trop contrainte pour l'ensemble TV + canapé : canapé seul et table basse devant
  if (!done) {
    const sofa = placeAgainst(ctx, 'canape', sortedSides(ctx, { avoidWindows: true }), { variant: '2p', pref: 'centre', minDepth: 2.2 });
    if (sofa) {
      const a = (sofa.rotation * Math.PI) / 180;
      const dist = sofa.d / 2 + 0.35 + 0.3;
      const t = build(ctx, { modelId: 'table_basse', x: sofa.x - Math.sin(a) * dist, y: sofa.y + Math.cos(a) * dist, rotation: sofa.rotation, w: 0.9 });
      if (t && fits(ctx, t, { gap: 0.25 })) commit(ctx, t);
    }
  }
  // espace repas
  if (area >= 22) {
    const sofa = ctx.placed.find((p) => p.item.modelId === 'canape');
    const cx = (ctx.inner.x0 + ctx.inner.x1) / 2;
    const cy = (ctx.inner.y0 + ctx.inner.y1) / 2;
    // à l'opposé de l'espace salon
    const far = sofa ? { x: 2 * cx - sofa.item.x, y: 2 * cy - sofa.item.y } : { x: cx, y: cy };
    const model = area >= 34 ? 'table_repas_6' : 'table_repas_4';
    if (!placeFree(ctx, model, { rotations: [0, 90], target: far })) placeFree(ctx, 'table_repas_4', { rotations: [0, 90], target: far });
  }
  if (area >= 16) {
    for (const [side, pref] of [['N', 'debut'], ['N', 'fin'], ['S', 'debut'], ['S', 'fin']] as const) {
      const p = build(ctx, against('plante', side, pref === 'debut' ? ctx.inner.x0 + 0.25 : ctx.inner.x1 - 0.25, ctx));
      if (p && fits(ctx, p, { gap: 0.1 })) {
        commit(ctx, p);
        break;
      }
    }
  }
}

function kitchen(ctx: Ctx) {
  const area = roomArea(ctx.room);
  const open = ctx.room.openPlan || /ouverte|coin/i.test(ctx.room.name);
  for (const side of sortedSides(ctx)) {
    const snap = snapshot(ctx);
    const [a, b] = sideRange(ctx, side);
    let cursor = a;
    const bases: FurnitureItem[] = [];
    const seq: { id: string; variant?: string; w: number; required: boolean }[] = [
      { id: 'refrigerateur', w: 0.6, required: false },
      { id: 'evier', w: 0.8, required: true },
      { id: 'plaque_cuisson', w: 0.6, required: true },
    ];
    let ok = true;
    for (const s of seq) {
      let placed: FurnitureItem | null = null;
      for (let c = cursor; c + s.w <= b + 1e-6; c += 0.05) {
        const p = build(ctx, against(s.id, side, c + s.w / 2, ctx, { variant: s.variant }));
        if (p && fits(ctx, p)) {
          placed = commit(ctx, p);
          cursor = c + s.w;
          break;
        }
      }
      if (placed) {
        if (s.id !== 'refrigerateur') bases.push(placed);
      } else if (s.required) {
        ok = false;
        break;
      }
    }
    if (!ok) {
      restore(ctx, snap);
      continue;
    }
    // meubles bas complémentaires (plan de travail) jusqu'à 3
    for (let k = 0; k < 3; k++) {
      let added = false;
      for (const v of ['80', '60'] as const) {
        const w = v === '80' ? 0.8 : 0.6;
        if (cursor + w > b + 1e-6) continue;
        const p = build(ctx, against('meuble_bas', side, cursor + w / 2, ctx, { variant: v }));
        if (p && fits(ctx, p)) {
          bases.push(commit(ctx, p));
          cursor += w;
          added = true;
          break;
        }
      }
      if (!added) break;
    }
    // meubles hauts au-dessus des meubles bas (jamais devant une fenêtre)
    for (const base of bases) {
      // contre le mur (profondeur 0,35), même largeur que le meuble bas
      const back = against('meubles_hauts', side, side === 'N' || side === 'S' ? base.x : base.y, ctx, { w: base.w });
      const q = build(ctx, back);
      if (q && fits(ctx, q)) commit(ctx, q);
    }
    break;
  }
  if (!open && area >= 9) {
    const target = { x: (ctx.inner.x0 + ctx.inner.x1) / 2, y: (ctx.inner.y0 + ctx.inner.y1) / 2 };
    if (!(area >= 12 && placeFree(ctx, 'table_repas_4', { rotations: [0, 90], target, gap: 0.35 }))) placeFree(ctx, 'table_repas_2', { rotations: [0, 90], target, gap: 0.3 });
  }
}

function bedroom(ctx: Ctx) {
  const area = roomArea(ctx.room);
  const minDim = Math.min(ctx.inner.x1 - ctx.inner.x0, ctx.inner.y1 - ctx.inner.y0);
  const variants = minDim >= 2.9 ? ['160', '140', '90'] : minDim >= 2.4 ? ['140', '90'] : ['90'];
  let bed: FurnitureItem | null = null;
  let bedSide: RoomSide | null = null;
  for (const v of variants) {
    const dims = variantDims(getFurnitureModel('lit')!, v);
    for (const side of sortedSides(ctx, { avoidWindows: true })) {
      bed = placeAgainst(ctx, 'lit', [side], { variant: v, minDepth: dims.d + 0.6 });
      if (bed) {
        bedSide = side;
        break;
      }
    }
    if (bed) break;
  }
  if (bed && bedSide) {
    const along = bedSide === 'N' || bedSide === 'S' ? bed.x : bed.y;
    const sign = bedSide === 'N' || bedSide === 'E' ? 1 : -1;
    const offs = bed.w / 2 + 0.05 + 0.225;
    const nights = bed.w >= 1.3 ? [along - offs * sign, along + offs * sign] : [along + offs * sign];
    for (const a of nights) {
      const p = build(ctx, against('chevet', bedSide, a, ctx));
      if (p && fits(ctx, p)) commit(ctx, p);
    }
  }
  const wardrobe = area >= 14 ? '160' : area >= 10 ? '120' : '100';
  const others = sortedSides(ctx, { avoidWindows: true, exclude: bedSide ? [bedSide] : [] });
  if (!placeAgainst(ctx, 'armoire', others, { variant: wardrobe, pref: 'debut' }) && !placeAgainst(ctx, 'armoire', others, { variant: wardrobe, pref: 'fin' }))
    placeAgainst(ctx, 'armoire', others, { variant: '100', pref: 'centre' });
  if (area >= 12) placeAgainst(ctx, 'bureau_poste', sortedSides(ctx, { preferWindows: true, exclude: bedSide ? [bedSide] : [] }), { pref: 'centre' });
  if (area >= 14) placeAgainst(ctx, 'commode', sortedSides(ctx, { avoidWindows: false }), { pref: 'centre' });
}

function bathroom(ctx: Ctx, separateWc: boolean) {
  const area = roomArea(ctx.room);
  const minDim = Math.min(ctx.inner.x1 - ctx.inner.x0, ctx.inner.y1 - ctx.inner.y0);
  const wc = () => (separateWc ? true : !!placeAgainst(ctx, 'wc', sortedSides(ctx), { pref: 'fin' }));
  const vasque = () => {
    const v = placeAgainst(ctx, 'meuble_vasque', sortedSides(ctx, { avoidWindows: true }), { pref: 'centre' }) ?? placeAgainst(ctx, 'meuble_vasque', sortedSides(ctx), { variant: '60', pref: 'centre' });
    if (v) {
      // miroir contre le mur, au-dessus de la vasque
      const side = sideOfRotation(v.rotation);
      const q = build(ctx, against('miroir', side, side === 'N' || side === 'S' ? v.x : v.y, ctx, { w: Math.min(0.7, v.w) }));
      if (q && fits(ctx, q)) commit(ctx, q);
    }
    return !!v;
  };
  // Grande salle de bain : baignoire + douche (uniquement si la géométrie le permet)
  if (area >= 7 && minDim >= 2.0) {
    const snap = snapshot(ctx);
    const tub = placeAgainst(ctx, 'baignoire', sortedSides(ctx, { avoidWindows: false }), { pref: 'debut' }) ?? placeAgainst(ctx, 'baignoire', sortedSides(ctx), { variant: '160', pref: 'fin' });
    const shower = tub && (placeAgainst(ctx, 'douche', sortedSides(ctx), { pref: 'fin' }) ?? placeAgainst(ctx, 'douche', sortedSides(ctx), { variant: '80', pref: 'debut' }));
    if (tub && shower && vasque() && wc()) {
      if (area >= 7.5) placeAgainst(ctx, 'colonne_sdb', sortedSides(ctx, { avoidWindows: true }), { pref: 'debut' });
      return;
    }
    restore(ctx, snap);
  }
  // Petite salle de bain : douche seule
  if (!placeAgainst(ctx, 'douche', sortedSides(ctx), { pref: 'debut' })) placeAgainst(ctx, 'douche', sortedSides(ctx), { variant: '80', pref: 'debut' });
  vasque();
  wc();
}

function toilet(ctx: Ctx) {
  placeAgainst(ctx, 'wc', sortedSides(ctx), { pref: 'centre' });
  if (roomArea(ctx.room) >= 1.6) placeAgainst(ctx, 'lave_mains', sortedSides(ctx), { pref: 'debut' });
}

function entrance(ctx: Ctx) {
  placeAgainst(ctx, 'meuble_chaussures', sortedSides(ctx), { pref: 'centre' });
  placeAgainst(ctx, 'porte_manteau', sortedSides(ctx), { pref: 'debut' });
  if (roomArea(ctx.room) >= 6) placeAgainst(ctx, 'console', sortedSides(ctx), { pref: 'centre' });
}

function corridor(ctx: Ctx) {
  const minDim = Math.min(ctx.inner.x1 - ctx.inner.x0, ctx.inner.y1 - ctx.inner.y0);
  // couloir étroit : aucun meuble (circulation)
  if (minDim >= 1.45) placeAgainst(ctx, 'rangement_bas', sortedSides(ctx), { pref: 'centre' });
}

function garage(ctx: Ctx) {
  const door = ctx.zones.find((z) => z.kind === 'porte' && ctx.level.openings.some((o) => o.type === 'porte_garage' && openingSide(ctx.room, o, ctx.level)?.side === z.side));
  const sides: RoomSide[] = door ? [OPPOSITE[door.side]] : sortedSides(ctx).filter((s) => depthFrom(ctx, s) >= 4.6);
  const car = placeAgainst(ctx, 'voiture', sides, { gap: 0.1, pref: 'centre' });
  placeAgainst(ctx, 'etagere', sortedSides(ctx, { exclude: car ? [sideOfRotation(car.rotation)] : [] }), { pref: 'debut' });
  if (roomArea(ctx.room) >= 18) placeAgainst(ctx, 'etabli', sortedSides(ctx), { pref: 'fin' });
}

function laundry(ctx: Ctx) {
  for (const side of sortedSides(ctx)) {
    const washer = placeAgainst(ctx, 'lave_linge', [side], { pref: 'debut' });
    if (!washer) continue;
    const along = side === 'N' || side === 'S' ? washer.x : washer.y;
    const next = build(ctx, against('seche_linge', side, along + 0.6, ctx));
    if (next && fits(ctx, next)) commit(ctx, next);
    const top = build(ctx, against('meuble_bas', side, along + (next ? 1.2 : 0.6) + 0.4, ctx, { variant: '80' }));
    if (top && fits(ctx, top)) commit(ctx, top);
    break;
  }
  placeAgainst(ctx, 'etagere', sortedSides(ctx), { pref: 'fin' });
}

function office(ctx: Ctx) {
  placeAgainst(ctx, 'bureau_poste', sortedSides(ctx, { preferWindows: true }), { pref: 'centre' });
  placeAgainst(ctx, 'bibliotheque', sortedSides(ctx, { avoidWindows: true }), { pref: 'debut' });
}

function veranda(ctx: Ctx) {
  placeFree(ctx, 'salon_jardin', { rotations: [0, 90], target: { x: (ctx.inner.x0 + ctx.inner.x1) / 2, y: (ctx.inner.y0 + ctx.inner.y1) / 2 }, gap: 0.3 });
  placeAgainst(ctx, 'plante', sortedSides(ctx), { pref: 'debut' });
}

/** Types de pièces sans mobilier par défaut (le conseiller choisit dans la bibliothèque). */
export const ROOMS_WITHOUT_DEFAULT: Room['type'][] = ['escalier', 'autre'];

export interface FurnishOptions {
  /** Logement sans chambre sur aucun niveau (studio). */
  studio?: boolean;
}

/** Options déduites du logement complet (tous niveaux). */
export function furnishOptions(levels: Level[]): FurnishOptions {
  return { studio: !levels.some((l) => l.rooms.some((r) => r.type === 'chambre')) };
}

/** Mobilier par défaut d'une pièce (aucun effet sur les autres pièces). */
export function furnishRoom(level: Level, room: Room, opts: FurnishOptions = {}): FurnitureItem[] {
  const ctx: Ctx = { level, room, inner: innerRect(room), zones: roomZones(level, room), placed: [], seq: 0, studio: !!opts.studio };
  if (ctx.inner.x1 - ctx.inner.x0 < 0.5 || ctx.inner.y1 - ctx.inner.y0 < 0.5) return [];
  switch (room.type) {
    case 'sejour':
      livingRoom(ctx);
      break;
    case 'cuisine':
      kitchen(ctx);
      break;
    case 'chambre':
      bedroom(ctx);
      break;
    case 'salle_de_bain':
      bathroom(ctx, level.rooms.some((r) => r.type === 'wc'));
      break;
    case 'wc':
      toilet(ctx);
      break;
    case 'entree':
      entrance(ctx);
      break;
    case 'couloir':
    case 'palier':
      corridor(ctx);
      break;
    case 'garage':
      garage(ctx);
      break;
    case 'cellier':
      laundry(ctx);
      break;
    case 'bureau':
      office(ctx);
      break;
    case 'veranda':
      veranda(ctx);
      break;
    default:
      break;
  }
  return ctx.placed.map((p) => p.item);
}

/** Mobilier par défaut de toutes les pièces d'un niveau. */
export function furnishLevel(level: Level, opts: FurnishOptions = {}): FurnitureItem[] {
  return level.rooms.flatMap((r) => furnishRoom(level, r, opts));
}

/**
 * Emplacement libre pour un objet ajouté par le conseiller dans une pièce déjà aménagée :
 * contre un mur si possible, sinon au plus près du centre ; à défaut, au centre de la pièce.
 */
export function findSpot(level: Level, room: Room, modelId: string, variant?: string): { x: number; y: number; rotation: number } {
  const ctx: Ctx = { level, room, inner: innerRect(room), zones: roomZones(level, room), placed: [], seq: 0, studio: false };
  for (const f of level.furniture ?? []) {
    if (f.roomId !== room.id) continue;
    ctx.placed.push({ item: f, rect: footprint(f), layer: getFurnitureModel(f.modelId)?.layer ?? 'sol' });
  }
  const n = ctx.placed.length;
  const item =
    placeAgainst(ctx, modelId, sortedSides(ctx), { variant, pref: 'centre' }) ??
    placeFree(ctx, modelId, { variant, rotations: [0, 90], target: { x: room.x + room.w / 2, y: room.y + room.h / 2 }, gap: 0.1 });
  if (item && ctx.placed.length > n) return { x: item.x, y: item.y, rotation: item.rotation };
  return { x: round(room.x + room.w / 2), y: round(room.y + room.h / 2), rotation: 0 };
}
