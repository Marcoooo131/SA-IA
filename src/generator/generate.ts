import type { HousingAnswers, Level, Opening, OpeningType, Plan, Room, RoomSide, RoomType } from '@/domain/types';
import { OPENING_DEFAULT_WIDTH, ROOM_TYPE_LABELS } from '@/domain/labels';
import { isExteriorAt, levelHabitableArea, nextOpeningCode, roomArea, roomsOverlap, roomSideSegment, sideNormal } from '@/plan/geometry';
import { bestTemplateFor, getTemplate, targetSurface, type HousingTemplate } from './templates';
import { furnishLevel, furnishOptions } from '@/furniture/placement';

/**
 * Générateur de plans DÉTERMINISTE (aucun aléatoire) :
 * modèle + réponses au questionnaire -> niveaux, pièces, cloisons, portes, fenêtres.
 *
 * Principe : les pièces sont rangées en bandes (bande avant « jour », couloir,
 * bande arrière « nuit »), ce qui garantit par construction l'absence de
 * chevauchement et des cloisons alignées. Les dimensions sont calculées pour
 * approcher la surface demandée. Le résultat est ensuite vérifié (accès,
 * surface, ouvertures) et doit toujours être relu par le conseiller.
 */

export interface GenerationResult {
  template: HousingTemplate;
  levels: Level[];
  /** Identifiants des éléments qui découlent directement d'une réponse. */
  fromAnswers: string[];
  warnings: string[];
  /** Vrai si le plan n'a pas pu être rendu cohérent (correction manuelle requise). */
  needsManualFix: boolean;
  stats: { habitableArea: number; targetArea: number; bedrooms: number; exteriorDoors: number; windows: number; bays: number };
}

interface Spec {
  key: string;
  type: RoomType;
  name: string;
  /** Surface souhaitée (m²), sert de poids dans la bande. */
  area: number;
  /** Largeur fixe (m) – ex. escalier. */
  fixedW?: number;
  /** Largeur minimale spécifique (sinon minimum du type de pièce). */
  minW?: number;
  fromAnswers?: boolean;
}

const r2 = (v: number) => Math.round(v * 20) / 20; // pas de 5 cm

/** Largeurs minimales réalistes (m) : garantissent la place d'une porte et d'un usage normal. */
const MIN_W: Partial<Record<RoomType, number>> = {
  entree: 1.8,
  cuisine: 2.4,
  sejour: 3.6,
  chambre: 2.8,
  salle_de_bain: 1.9,
  wc: 1.1,
  bureau: 2.4,
  cellier: 1.7,
  autre: 2,
};
const minWidth = (s: Spec) => s.fixedW ?? s.minW ?? MIN_W[s.type] ?? 1.5;
const CORRIDOR = 1.2;
const STAIR_W = 1.2;

export function normalizeAnswers(a: HousingAnswers): HousingAnswers {
  const levels = (Math.min(3, Math.max(1, a.levels)) as 1 | 2 | 3);
  return {
    ...a,
    levels,
    bedrooms: Math.min(8, Math.max(0, Math.round(a.bedrooms))),
    mainRooms: Math.min(12, Math.max(1, Math.round(a.mainRooms ?? 1))),
    exteriorAccesses: Math.min(6, Math.max(1, Math.round(a.exteriorAccesses))),
    windows: Math.min(30, Math.max(0, Math.round(a.windows))),
    bays: Math.min(8, Math.max(0, Math.round(a.bays))),
    extraDoors: Math.min(4, Math.max(0, Math.round(a.extraDoors))),
    garage: a.housingType === 'appartement' ? 'aucun' : a.garage,
    features: {
      ...a.features,
      stairs: levels > 1 ? true : a.features.stairs,
      garageCommunicating: a.garage === 'attenant' ? a.features.garageCommunicating : false,
    },
  };
}

// ---------------------------------------------------------------------------
// Ouvertures : gestion de l'occupation des murs pour éviter les recouvrements
// ---------------------------------------------------------------------------

class WallOccupancy {
  private used = new Map<string, [number, number][]>();
  private key(room: Room, side: RoomSide) {
    const s = roomSideSegment(room, side);
    return side === 'N' || side === 'S' ? `h:${s.a.y.toFixed(2)}` : `v:${s.a.x.toFixed(2)}`;
  }
  /** Cherche une position libre (offset depuis le début du côté) proche de `preferred`. */
  place(room: Room, side: RoomSide, width: number, preferred: number, range?: [number, number]): number | null {
    const seg = roomSideSegment(room, side);
    const len = side === 'N' || side === 'S' ? room.w : room.h;
    const origin = side === 'N' || side === 'S' ? seg.a.x : seg.a.y;
    const margin = len < 1.6 ? 0.08 : 0.25;
    const lo = Math.max(margin + width / 2, (range?.[0] ?? 0) + width / 2 + 0.05);
    const hi = Math.min(len - margin - width / 2, (range?.[1] ?? len) - width / 2 - 0.05);
    if (hi < lo) return null;
    const list = this.used.get(this.key(room, side)) ?? [];
    const free = (c: number) => list.every(([a, b]) => origin + c + width / 2 + 0.2 <= a || origin + c - width / 2 - 0.2 >= b);
    const start = Math.min(hi, Math.max(lo, preferred));
    for (let d = 0; d <= len; d += 0.05) {
      for (const c of [start + d, start - d]) if (c >= lo && c <= hi && free(c)) return r2(c);
    }
    return null;
  }
  mark(room: Room, side: RoomSide, center: number, width: number) {
    const seg = roomSideSegment(room, side);
    const origin = side === 'N' || side === 'S' ? seg.a.x : seg.a.y;
    const k = this.key(room, side);
    const list = this.used.get(k) ?? [];
    list.push([origin + center - width / 2, origin + center + width / 2]);
    this.used.set(k, list);
  }
}

function sideLength(room: Room, side: RoomSide) {
  return side === 'N' || side === 'S' ? room.w : room.h;
}

function exteriorSides(level: Level, room: Room): RoomSide[] {
  return (['N', 'S', 'E', 'W'] as RoomSide[]).filter((side) => {
    const seg = roomSideSegment(room, side);
    // côté entièrement extérieur (échantillonné en 5 points)
    for (let i = 1; i <= 5; i++) {
      const t = i / 6;
      const p = { x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t };
      if (!isExteriorAt(level, room.id, side, p)) return false;
    }
    return true;
  });
}

/** Côté de `a` partagé avec `b`, et intervalle commun (en coordonnées globales). */
function sharedSide(a: Room, b: Room): { side: RoomSide; from: number; to: number } | null {
  const eps = 0.02;
  const ox = [Math.max(a.x, b.x), Math.min(a.x + a.w, b.x + b.w)] as const;
  const oy = [Math.max(a.y, b.y), Math.min(a.y + a.h, b.y + b.h)] as const;
  if (Math.abs(a.y + a.h - b.y) < eps && ox[1] - ox[0] > 0) return { side: 'S', from: ox[0], to: ox[1] };
  if (Math.abs(b.y + b.h - a.y) < eps && ox[1] - ox[0] > 0) return { side: 'N', from: ox[0], to: ox[1] };
  if (Math.abs(a.x + a.w - b.x) < eps && oy[1] - oy[0] > 0) return { side: 'E', from: oy[0], to: oy[1] };
  if (Math.abs(b.x + b.w - a.x) < eps && oy[1] - oy[0] > 0) return { side: 'W', from: oy[0], to: oy[1] };
  return null;
}

// ---------------------------------------------------------------------------
// Génération
// ---------------------------------------------------------------------------

export function generatePlan(templateOrId: HousingTemplate | string, rawAnswers: HousingAnswers): GenerationResult {
  let template = typeof templateOrId === 'string' ? getTemplate(templateOrId) : templateOrId;
  if (template.id === 'personnalise') template = { ...bestTemplateFor(rawAnswers), id: 'personnalise', name: 'Logement personnalisé' };
  const a = normalizeAnswers(rawAnswers);
  const warnings: string[] = [];
  const fromAnswers: string[] = [];
  let shape = template.shape;
  if (shape === 'L' && a.levels > 1) {
    shape = 'rect';
    warnings.push('La forme en L est prévue pour un plain-pied : disposition rectangulaire utilisée pour plusieurs niveaux.');
  }

  const A = targetSurface(a);
  const studio = a.bedrooms === 0;
  const extensionArea = a.features.extension ? Math.max(10, Math.round(A * 0.1)) : 0;
  const mainArea = Math.max(18, A - extensionArea);
  const perLevel = mainArea / a.levels;
  const hasCorridor = !studio && (a.levels > 1 || a.corridor || !!template.forceCorridor || shape === 'L');

  // ----- Programme des pièces par niveau
  const kitchen: Spec = studio
    ? { key: 'cuisine', type: 'cuisine', name: 'Coin cuisine', area: Math.max(4, A * 0.1), minW: 1.8, fromAnswers: true }
    : {
        key: 'cuisine',
        type: 'cuisine',
        name: a.kitchen === 'ouverte' ? 'Cuisine ouverte' : 'Cuisine',
        area: Math.max(6, A * 0.11),
        fromAnswers: true,
      };
  const living: Spec = { key: 'sejour', type: 'sejour', name: studio ? 'Pièce de vie' : 'Séjour', area: Math.max(12, A * (studio ? 0.5 : 0.26)), minW: studio ? 3 : undefined, fromAnswers: true };
  const entry: Spec = { key: 'entree', type: 'entree', name: 'Entrée', area: A < 45 ? 3 : Math.min(7, A * 0.05), minW: studio ? 1.5 : undefined };
  const bath: Spec = { key: 'sdb', type: 'salle_de_bain', name: studio ? 'Salle d’eau' : 'Salle de bain', area: A > 110 ? 7 : 5 };
  const wc: Spec = { key: 'wc', type: 'wc', name: 'WC', area: 2 };
  // Pièces principales = séjour + chambres + pièces supplémentaires (bureau…)
  const wantedExtras = Math.max(a.features.extraRoom ? 1 : 0, a.mainRooms - 1 - a.bedrooms);
  if (a.mainRooms < 1 + a.bedrooms)
    warnings.push(`Nombre de pièces principales (${a.mainRooms}) inférieur à séjour + chambres (${1 + a.bedrooms}) : le nombre de chambres a été retenu.`);
  if (studio && wantedExtras > 0)
    warnings.push('Logement sans chambre : les pièces supplémentaires demandées ne sont pas générées, ajoutez-les dans le tableau des pièces si besoin.');
  const extras = studio ? 0 : Math.min(3, wantedExtras);
  if (!studio && wantedExtras > 3) warnings.push('Au-delà de 3 pièces supplémentaires, ajoutez-les dans le tableau des pièces.');
  const offices: Spec[] = Array.from({ length: extras }, (_, i) => ({
    key: i === 0 ? 'bureau' : `bureau${i + 1}`,
    type: 'bureau' as RoomType,
    name: i === 0 ? 'Bureau' : `Pièce supplémentaire ${i + 1}`,
    area: 9,
    fromAnswers: true,
  }));
  const stairs = (lvl: number): Spec => ({ key: 'escalier', type: 'escalier', name: lvl === 0 ? 'Escalier' : 'Trémie d’escalier', area: STAIR_W * 3, fixedW: STAIR_W, fromAnswers: true });
  const bedroomSpecs = Array.from({ length: a.bedrooms }, (_, i) => ({
    key: `ch${i + 1}`,
    type: 'chambre' as RoomType,
    name: `Chambre ${i + 1}`,
    area: i === 0 ? 13 : 11,
    fromAnswers: true,
  }));

  type LevelProgram = { front: Spec[]; back: Spec[]; corridorName: string };
  const programs: LevelProgram[] = [];
  const openKitchen = a.kitchen !== 'separee';
  const dayRow = (): Spec[] => (studio ? [living, kitchen] : openKitchen ? [entry, kitchen, living] : [kitchen, entry, living]);
  if (a.levels === 1) {
    const back: Spec[] = studio ? [entry, bath] : [...bedroomSpecs, bath, ...(A >= 60 ? [wc] : [])];
    back.push(...offices);
    programs.push({ front: dayRow(), back, corridorName: 'Couloir' });
  } else {
    // Chambres réparties sur les étages ; au-delà de 4 par étage, une chambre au rez-de-chaussée
    const upper = a.levels - 1;
    const perUpper = Math.ceil(a.bedrooms / upper);
    const groundBedrooms = perUpper > 4 ? bedroomSpecs.slice(0, a.bedrooms - upper * 4) : [];
    const rest = bedroomSpecs.slice(groundBedrooms.length);
    programs.push({
      front: dayRow(),
      back: [stairs(0), wc, ...groundBedrooms, ...offices, { key: 'cellier', type: 'cellier', name: 'Cellier / buanderie', area: 5 }],
      corridorName: 'Dégagement',
    });
    for (let u = 0; u < upper; u++) {
      const mine = rest.filter((_, i) => i % upper === u);
      const half = Math.ceil(mine.length / 2);
      programs.push({
        front: mine.slice(0, half).length ? mine.slice(0, half) : [{ key: 'mezzanine', type: 'bureau', name: 'Mezzanine / bureau', area: 10 }],
        back: [stairs(u + 1), bath, ...mine.slice(half)],
        corridorName: 'Palier',
      });
    }
  }

  // ----- Dimensions communes (même emprise pour tous les niveaux)
  const prog0 = programs[0];
  const sum = (l: Spec[]) => l.reduce((s, x) => s + x.area, 0);
  const aspect = a.housingType === 'appartement' ? 1.45 : 1.7;
  const dc = hasCorridor ? CORRIDOR : 0;
  let W = 0;
  let dFront = 0;
  let dBack = 0;

  const levels: Level[] = [];
  const plan: Plan = { levels };
  const occ: WallOccupancy[] = [];
  const mkRoom = (lvl: number, s: Spec, x: number, y: number, w: number, h: number): Room => {
    const room: Room = { id: `gen_${lvl}_${s.key}`, name: s.name, type: s.type, x: r2(x), y: r2(y), w: r2(w), h: r2(h), openPlan: false };
    if (s.fromAnswers) fromAnswers.push(room.id);
    return room;
  };
  /** Largeurs d'une bande : surface/profondeur, bornées par les minimums, ajustées à la largeur totale. */
  const rowWidths = (specs: Spec[], depth: number, width: number): number[] => {
    const mins = specs.map(minWidth);
    const want = specs.map((sp, i) => (sp.fixedW ? sp.fixedW : Math.max(mins[i], sp.area / depth)));
    const total = want.reduce((x, y) => x + y, 0);
    if (total > width) {
      // réduire uniquement au-dessus des minimums
      const slack = want.map((w, i) => (specs[i].fixedW ? 0 : w - mins[i]));
      const slackTotal = slack.reduce((x, y) => x + y, 0) || 1;
      const over = total - width;
      return want.map((w, i) => w - (over * slack[i]) / slackTotal);
    }
    const flex = specs.map((sp) => (sp.fixedW ? 0 : sp.area));
    const flexTotal = flex.reduce((x, y) => x + y, 0) || 1;
    return want.map((w, i) => w + ((width - total) * flex[i]) / flexTotal);
  };
  const minRow = (specs: Spec[]) => specs.reduce((t, sp) => t + minWidth(sp), 0);
  const placeRow = (lvl: number, specs: Spec[], y: number, depth: number, x0: number, width: number): Room[] => {
    const widths = rowWidths(specs, depth, width);
    const out: Room[] = [];
    let cursor = x0;
    specs.forEach((sp, i) => {
      const end = i === specs.length - 1 ? x0 + width : r2(cursor + widths[i]);
      out.push(mkRoom(lvl, sp, cursor, y, end - cursor, depth));
      cursor = end;
    });
    return out;
  };

  if (shape === 'L') {
    // Aile de jour (bande horizontale) + aile de nuit en équerre (colonne + couloir)
    const dayArea = sum(prog0.front);
    const nightSpecs = prog0.back;
    const wingW = 4;
    dFront = 4.2;
    W = r2(Math.max(wingW + CORRIDOR + 4.4, dayArea / dFront, minRow(prog0.front)));
    const front = placeRow(0, [living, kitchen, entry].filter((s) => prog0.front.includes(s)), 0, dFront, 0, W);
    // couloir côté est, sous l'entrée (dernière pièce de la bande de jour) ; chambres à l'ouest du couloir
    const wingX = W - CORRIDOR - wingW;
    let y = dFront;
    const night: Room[] = nightSpecs.map((s) => {
      const h = Math.max(s.type === 'chambre' ? 3 : 1.5, r2(s.area / wingW));
      const room = mkRoom(0, s, wingX, y, wingW, h);
      y = r2(y + h);
      return room;
    });
    const corridor = mkRoom(0, { key: 'couloir', type: 'couloir', name: 'Couloir', area: 0, fromAnswers: a.corridor }, W - CORRIDOR, dFront, CORRIDOR, y - dFront);
    levels.push(baseLevel(0, [...front, corridor, ...night]));
    dBack = y - dFront;
  } else {
    const F = perLevel;
    const D0 = Math.sqrt(F / aspect);
    const backArea = sum(prog0.back);
    const frontArea = sum(prog0.front);
    if (prog0.back.length) {
      dFront = Math.min(6.5, Math.max(3.5, ((D0 - dc) * frontArea) / (frontArea + backArea)));
      dBack = Math.min(6, Math.max(3.1, D0 - dc - dFront));
    } else {
      dFront = D0;
      dBack = 0;
    }
    dFront = r2(dFront);
    dBack = r2(dBack);
    const D = dFront + dc + dBack;
    // largeur : surface visée, mais jamais moins que la somme des largeurs minimales d'une bande
    const minW = Math.max(...programs.flatMap((p) => [minRow(p.front), minRow(p.back)]));
    W = r2(Math.max(F / D, minW, STAIR_W + 4));
    if (minW > F / D + 0.5) warnings.push('Les pièces demandées dépassent la surface indiquée : le plan a été élargi.');
    programs.forEach((p, lvl) => {
      const rooms: Room[] = [...placeRow(lvl, p.front, 0, dFront, 0, W)];
      if (hasCorridor && p.back.length)
        rooms.push(mkRoom(lvl, { key: 'couloir', type: lvl === 0 ? 'couloir' : 'palier', name: p.corridorName, area: 0, fromAnswers: lvl === 0 && a.corridor }, 0, dFront, W, CORRIDOR));
      if (p.back.length) rooms.push(...placeRow(lvl, p.back, dFront + dc, dBack, 0, W));
      levels.push(baseLevel(lvl, rooms));
    });
  }

  // ----- Annexes : garage, véranda, extension (rez-de-chaussée)
  const L0 = levels[0];
  const find = (lvl: Level, key: string) => lvl.rooms.find((r) => r.id === `gen_${lvl.index}_${key}`);
  const garageSide: 'W' | 'E' = shape === 'L' ? 'E' : 'W';
  if (a.garage !== 'aucun') {
    const gw = 3.6;
    const gh = Math.min(6, Math.max(5, dFront));
    const gap = a.garage === 'separe' ? 2.5 : 0;
    const gx = garageSide === 'W' ? -gw - gap : W + gap;
    L0.rooms.push(mkRoom(0, { key: 'garage', type: 'garage', name: a.garage === 'separe' ? 'Garage (séparé)' : 'Garage', area: 0, fromAnswers: true }, gx, 0, gw, gh));
  }
  if (a.features.veranda) {
    const vx = shape === 'L' ? -3 : W;
    L0.rooms.push(mkRoom(0, { key: 'veranda', type: 'veranda', name: 'Véranda', area: 0, fromAnswers: true }, vx, 0, 3, Math.min(dFront, 4.5)));
    if (a.garage === 'attenant' && garageSide === (shape === 'L' ? 'W' : 'E')) warnings.push('Véranda et garage du même côté : vérifier la disposition.');
  }
  if (a.features.extension) {
    const yTop = dFront + dc + dBack;
    const ew = Math.min(W, Math.max(3, r2(extensionArea / 3.5)));
    // sous la première pièce de la bande arrière (pièce sèche), jamais derrière une salle d'eau
    L0.rooms.push(mkRoom(0, { key: 'extension', type: 'autre', name: 'Extension', area: 0, fromAnswers: true }, 0, yTop, ew, 3.5));
  }

  // ----- Ouvertures
  levels.forEach(() => occ.push(new WallOccupancy()));
  const add = (lvl: Level, room: Room, side: RoomSide, type: OpeningType, opts: { width?: number; key: string; preferred?: number; range?: [number, number]; exterior?: boolean; sectional?: boolean; answer?: boolean }) => {
    const len = sideLength(room, side);
    const width = Math.min(opts.width ?? OPENING_DEFAULT_WIDTH[type], len - (len < 1.6 ? 0.2 : 0.6));
    if (width < 0.5) return null;
    const preferred = opts.preferred ?? len / 2;
    const offset = occ[lvl.index].place(room, side, width, preferred, opts.range);
    if (offset === null) return null;
    occ[lvl.index].mark(room, side, offset, width);
    const o: Opening = {
      id: `gen_${lvl.index}_o_${opts.key}`,
      code: nextOpeningCode(plan, lvl),
      type,
      host: { kind: 'room', roomId: room.id, side },
      offset,
      width: r2(width),
      exterior: opts.exterior ?? false,
      sectional: opts.sectional ?? false,
    };
    lvl.openings.push(o);
    if (opts.answer) fromAnswers.push(o.id);
    return o;
  };
  /** Porte (ou passage) entre deux pièces contiguës, placée près d'un angle. */
  const connect = (lvl: Level, from: Room, to: Room, type: OpeningType, key: string, width?: number) => {
    const sh = sharedSide(from, to);
    if (!sh) return null;
    // largeur réduite si le mur commun est court (ex. WC), jamais sous 0,6 m
    const w = Math.min(width ?? OPENING_DEFAULT_WIDTH[type], sh.to - sh.from - 0.4);
    if (w < 0.6) return null;
    const origin = sh.side === 'N' || sh.side === 'S' ? from.x : from.y;
    const range: [number, number] = [sh.from - origin, sh.to - origin];
    const preferred = type === 'passage' ? (range[0] + range[1]) / 2 : range[0] + 0.35 + w / 2;
    return add(lvl, from, sh.side, type, { width: w, key, preferred, range });
  };

  levels.forEach((lvl) => {
    const corridor = lvl.rooms.find((r) => r.type === 'couloir' || r.type === 'palier');
    const kitchenRoom = find(lvl, 'cuisine');
    const livingRoom = find(lvl, 'sejour');
      // cuisine ouverte / partiellement ouverte : passage vers le séjour
    if (kitchenRoom && livingRoom && a.kitchen !== 'separee') {
      const sh = sharedSide(kitchenRoom, livingRoom);
      const width = sh ? (a.kitchen === 'ouverte' ? Math.max(1.2, sh.to - sh.from - 0.8) : 1.2) : 1.2;
      if (connect(lvl, kitchenRoom, livingRoom, 'passage', 'cuisine_sejour', width)) {
        kitchenRoom.openPlan = a.kitchen === 'ouverte';
        livingRoom.openPlan = a.kitchen === 'ouverte';
      }
    }
    for (const room of lvl.rooms) {
      if (room === corridor || ['garage', 'veranda'].includes(room.type) || room.id.endsWith('_extension')) continue;
      if (corridor && sharedSide(room, corridor)) {
        if (room.type === 'escalier' || (room === kitchenRoom && a.kitchen !== 'separee')) connect(lvl, room, corridor, 'passage', `${room.id}_c`, 1.0);
        else connect(lvl, room, corridor, 'porte_interieure', `${room.id}_c`);
      }
    }
    {
      // chaînage des pièces de jour : chaînage des pièces de la bande avant, puis bande arrière vers la pièce avant la plus large en commun
      const front = lvl.rooms.filter((r) => r.y === 0 && !['garage', 'veranda'].includes(r.type)).sort((p, q) => p.x - q.x);
      for (let i = 0; i < front.length - 1; i++) {
        const p = front[i];
        const q = front[i + 1];
        if ((p === kitchenRoom && q === livingRoom) || (q === kitchenRoom && p === livingRoom)) {
          if (a.kitchen !== 'separee') continue;
        }
        connect(lvl, p, q, 'porte_interieure', `${p.id}_${q.id}`);
      }
      if (!corridor) {
        const back = lvl.rooms.filter((r) => r.y > 0 && !['garage', 'veranda'].includes(r.type) && !r.id.endsWith('_extension'));
        for (const b of back) {
          const options = front
            .map((f) => ({ f, sh: sharedSide(b, f) }))
            .filter((x) => x.sh && x.sh.to - x.sh.from >= 1.0)
            .sort((x, y) => (x.f.type === 'cuisine' ? 1 : 0) - (y.f.type === 'cuisine' ? 1 : 0) || y.sh!.to - y.sh!.from - (x.sh!.to - x.sh!.from));
          if (options[0]) connect(lvl, b, options[0].f, 'porte_interieure', `${b.id}_f`);
        }
      }
    }
  });

  // Annexes
  const garage = find(L0, 'garage');
  if (garage) {
    add(L0, garage, 'N', 'porte_garage', { width: 2.4, key: 'garage', exterior: true, sectional: true, answer: true });
    if (a.garage === 'attenant') {
      const neighbour = L0.rooms.filter((r) => r !== garage && sharedSide(garage, r)).sort((p, q) => (sharedSide(garage, q)!.to - sharedSide(garage, q)!.from) - (sharedSide(garage, p)!.to - sharedSide(garage, p)!.from))[0];
      if (a.features.garageCommunicating && neighbour) connect(L0, garage, neighbour, 'porte_interieure', 'garage_int');
    } else {
      add(L0, garage, 'S', 'porte', { key: 'garage_service', exterior: true });
    }
  }
  const veranda = find(L0, 'veranda');
  if (veranda) {
    const living0 = find(L0, 'sejour');
    if (living0) connect(L0, veranda, living0, 'passage', 'veranda', 1.8);
    for (const side of exteriorSides(L0, veranda)) add(L0, veranda, side, 'baie', { key: `veranda_${side}`, exterior: true, answer: true });
  }
  const extension = find(L0, 'extension');
  if (extension) {
    const host = L0.rooms
      .filter((r) => r !== extension && sharedSide(extension, r) && !['escalier', 'salle_de_bain', 'wc'].includes(r.type))
      .sort((p, q) => (sharedSide(extension, q)!.to - sharedSide(extension, q)!.from) - (sharedSide(extension, p)!.to - sharedSide(extension, p)!.from))[0];
    if (host) connect(L0, extension, host, 'porte_interieure', 'extension');
    else warnings.push("L'extension n'est reliée à aucune pièce : ajouter une porte.");
  }

  // Porte d'entrée et accès extérieurs
  const mainEntry = find(L0, 'entree') ?? find(L0, 'sejour') ?? L0.rooms[0];
  const pickSide = (lvl: Level, room: Room, prefs: RoomSide[]) => {
    const ext = exteriorSides(lvl, room);
    return prefs.find((s) => ext.includes(s)) ?? ext[0];
  };
  let doors = 0;
  const frontSide = mainEntry ? pickSide(L0, mainEntry, ['N', 'S', 'W', 'E']) : undefined;
  if (mainEntry && frontSide && add(L0, mainEntry, frontSide, 'porte', { key: 'entree', exterior: true, answer: true })) doors++;
  else warnings.push("Porte d'entrée non placée : l'entrée n'a pas de mur extérieur libre.");
  const accessCandidates = ['sejour', 'cuisine', 'extension', 'bureau', 'cellier', 'couloir']
    .map((k) => find(L0, k))
    .filter((r): r is Room => !!r);
  let wanted = a.exteriorAccesses - 1 + a.extraDoors;
  for (const room of accessCandidates) {
    if (wanted <= 0) break;
    const side = pickSide(L0, room, ['S', 'E', 'W', 'N']);
    if (side && add(L0, room, side, 'porte', { key: `acces_${room.type}`, exterior: true, answer: true })) {
      doors++;
      wanted--;
    }
  }
  if (wanted > 0) warnings.push(`${wanted} accès extérieur(s) demandé(s) n'ont pas pu être placés automatiquement.`);

  // Baies vitrées puis fenêtres
  let bays = 0;
  const bayRooms = ['sejour', 'cuisine', 'ch1', 'ch2', 'bureau'];
  for (let round = 0; round < 3 && bays < a.bays; round++)
    for (const key of bayRooms) {
      if (bays >= a.bays) break;
      const room = find(L0, key) ?? levels.map((l) => find(l, key)).find(Boolean);
      if (!room) continue;
      const lvl = levels.find((l) => l.rooms.includes(room))!;
      const sides = exteriorSides(lvl, room).sort((p, q) => (p === 'S' ? -1 : q === 'S' ? 1 : 0));
      const side = sides[round % Math.max(1, sides.length)];
      if (side && sideLength(room, side) >= 3 && add(lvl, room, side, 'baie', { key: `baie_${bays}`, exterior: true, answer: true })) bays++;
    }
  if (bays < a.bays) warnings.push(`${a.bays - bays} baie(s) vitrée(s) n'ont pas pu être placées (murs trop courts).`);

  let windows = 0;
  const windowOrder = (l: Level) =>
    l.rooms
      .filter((r) => !['couloir', 'escalier', 'garage', 'veranda'].includes(r.type))
      .sort((p, q) => windowPriority(p.type) - windowPriority(q.type));
  for (let round = 0; round < 4 && windows < a.windows; round++) {
    for (const lvl of levels) {
      for (const room of windowOrder(lvl)) {
        if (windows >= a.windows) break;
        const sides = exteriorSides(lvl, room);
        if (!sides.length) continue;
        const side = sides[round % sides.length];
        const small = room.type === 'salle_de_bain' || room.type === 'wc' || room.type === 'cellier';
        if (round > 0 && small) continue;
        if (add(lvl, room, side, 'fenetre', { width: small ? 0.6 : 1.2, key: `fen_${windows}`, exterior: true, answer: true })) windows++;
      }
    }
  }
  if (windows < a.windows) warnings.push(`${a.windows - windows} fenêtre(s) n'ont pas pu être placées : à ajouter manuellement.`);

  // ----- Vérifications de cohérence
  for (const lvl of levels) {
    for (let i = 0; i < lvl.rooms.length; i++)
      for (let j = i + 1; j < lvl.rooms.length; j++)
        if (roomsOverlap(lvl.rooms[i], lvl.rooms[j])) warnings.push(`${lvl.name} : « ${lvl.rooms[i].name} » et « ${lvl.rooms[j].name} » se chevauchent.`);
  }
  const unreachable = unreachableRooms(levels);
  for (const r of unreachable) warnings.push(`« ${r.name} » n'est reliée à aucune autre pièce par une porte.`);
  const habitable = levels.reduce((s, l) => s + levelHabitableArea(l), 0) - levels.reduce((s, l) => s + l.rooms.filter((r) => r.type === 'veranda').reduce((t, r) => t + roomArea(r), 0), 0);
  if (Math.abs(habitable - A) / A > 0.2)
    warnings.push(`Surface obtenue ${habitable.toFixed(0)} m² pour ${A} m² demandés : ajuster les dimensions si nécessaire.`);
  if (a.comment.trim()) warnings.push(`Particularité à reporter manuellement : « ${a.comment.trim()} ».`);
  if (a.features.other) warnings.push('Particularité « autre » signalée : à compléter manuellement sur le plan.');

  // porte d'entrée principale + mobilier générique (déterministe, recalculé à chaque génération)
  const entryDoor = levels[0]?.openings.find((o) => o.id === 'gen_0_o_entree');
  if (entryDoor) entryDoor.entry = true;
  const fopts = furnishOptions(levels);
  for (const l of levels) l.furniture = furnishLevel(l, fopts);

  const needsManualFix = warnings.some((w) => w.includes('chevauchent') || w.includes("n'est reliée") || w.includes('Porte d\'entrée non placée'));
  return {
    template,
    levels,
    fromAnswers,
    warnings,
    needsManualFix,
    stats: { habitableArea: Math.round(habitable * 10) / 10, targetArea: A, bedrooms: a.bedrooms, exteriorDoors: doors, windows, bays },
  };
}

function windowPriority(t: RoomType): number {
  const order: RoomType[] = ['sejour', 'cuisine', 'chambre', 'bureau', 'salle_de_bain', 'autre', 'entree', 'palier', 'wc', 'cellier'];
  const i = order.indexOf(t);
  return i < 0 ? 99 : i;
}

function baseLevel(index: number, rooms: Room[]): Level {
  return {
    id: `gen_lvl_${index}`,
    name: index === 0 ? 'Rez-de-chaussée' : `Étage (R+${index})`,
    index,
    height: 2.5,
    rooms,
    walls: [],
    openings: [],
    background: null,
  };
}

/** Pièces non reliées au reste du logement (portes et passages). Le garage, accessible par sa porte, est exclu. */
export function unreachableRooms(levels: Level[]): Room[] {
  const out: Room[] = [];
  for (const lvl of levels) {
    const rooms = lvl.rooms.filter((r) => r.type !== 'garage');
    if (rooms.length <= 1) continue;
    const adj = new Map<string, Set<string>>(rooms.map((r) => [r.id, new Set<string>()]));
    for (const o of lvl.openings) {
      if (o.exterior || o.host.kind !== 'room') continue;
      const host = rooms.find((r) => o.host.kind === 'room' && r.id === o.host.roomId);
      if (!host) continue;
      const seg = roomSideSegment(host, o.host.side);
      const n = sideNormal(o.host.side);
      const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
      const t = o.offset / len;
      const p = { x: seg.a.x + (seg.b.x - seg.a.x) * t + n.x * 0.15, y: seg.a.y + (seg.b.y - seg.a.y) * t + n.y * 0.15 };
      const other = rooms.find((r) => r !== host && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
      if (other) {
        adj.get(host.id)!.add(other.id);
        adj.get(other.id)!.add(host.id);
      }
    }
    const start = rooms.find((r) => r.type === 'entree') ?? rooms.find((r) => r.type === 'couloir' || r.type === 'palier') ?? rooms[0];
    const seen = new Set([start.id]);
    const queue = [start.id];
    while (queue.length) for (const n of adj.get(queue.shift()!)!) if (!seen.has(n)) (seen.add(n), queue.push(n));
    out.push(...rooms.filter((r) => !seen.has(r.id)));
  }
  return out;
}

export function roomTypeLabel(t: RoomType) {
  return ROOM_TYPE_LABELS[t];
}
