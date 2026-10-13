import type { Level, Opening, OpeningType, PlacedDevice, Plan, Point, Room } from '@/domain/types';
import { OPENING_DEFAULT_WIDTH, OPENING_TYPE_LABELS } from '@/domain/labels';
import type { RulesConfig } from '@/rules/config';
import { uid } from '@/lib/id';
import { addRoom, freeSpot, type Draft } from './actions';
import { clampOffset, isExteriorAt, nearestHost, nextOpeningCode, openingPlacement, openingRoomId, projectOnSegment, roomSideSegment, segmentLength, sideNormal } from './geometry';

/**
 * Menuiseries par pièce.
 * Règle fondamentale : une ouverture n'existe qu'UNE fois (Level.openings). Le tableau
 * des pièces, le plan 2D, la 3D et l'audit lisent tous cette même liste ; les totaux
 * sont toujours recalculés, jamais stockés. Une quantité saisie avant le dessin crée des
 * ouvertures « à positionner » (host.kind = 'unplaced').
 */

/** Colonnes du tableau des menuiseries. */
export type JoineryKind = 'porte_ext' | 'porte_int' | 'fenetre' | 'baie' | 'autre_ext';

export const JOINERY_COLUMNS: { kind: JoineryKind; label: string; short: string }[] = [
  { kind: 'porte_ext', label: 'Portes extérieures', short: 'Portes ext.' },
  { kind: 'porte_int', label: 'Portes intérieures', short: 'Portes int.' },
  { kind: 'fenetre', label: 'Fenêtres', short: 'Fenêtres' },
  { kind: 'baie', label: 'Baies vitrées', short: 'Baies' },
  { kind: 'autre_ext', label: 'Autres ouvertures extérieures', short: 'Autres ext.' },
];

/** Classement d'une ouverture dans une colonne (null = non comptée, ex. passage ouvert). */
export function joineryKind(o: Opening): JoineryKind | null {
  switch (o.type) {
    case 'porte':
      return o.exterior ? 'porte_ext' : 'porte_int';
    case 'porte_garage':
      return 'porte_ext';
    case 'porte_interieure':
      return 'porte_int';
    case 'fenetre':
    case 'porte_fenetre':
      return 'fenetre';
    case 'baie':
      return 'baie';
    case 'autre':
      return o.exterior ? 'autre_ext' : null;
    default:
      return null;
  }
}

/** Ouverture créée par une saisie de quantité. */
function typeForKind(kind: JoineryKind): { type: OpeningType; exterior: boolean } {
  switch (kind) {
    case 'porte_ext':
      return { type: 'porte', exterior: true };
    case 'porte_int':
      return { type: 'porte_interieure', exterior: false };
    case 'fenetre':
      return { type: 'fenetre', exterior: true };
    case 'baie':
      return { type: 'baie', exterior: true };
    case 'autre_ext':
      return { type: 'autre', exterior: true };
  }
}

export function roomOpenings(level: Level, roomId: string): Opening[] {
  return level.openings.filter((o) => openingRoomId(level, o) === roomId);
}

export type JoineryCounts = Record<JoineryKind, number> & { portes: number; aPositionner: number; total: number };

export function emptyCounts(): JoineryCounts {
  return { porte_ext: 0, porte_int: 0, fenetre: 0, baie: 0, autre_ext: 0, portes: 0, aPositionner: 0, total: 0 };
}

export function countOpenings(openings: Opening[]): JoineryCounts {
  const c = emptyCounts();
  for (const o of openings) {
    const k = joineryKind(o);
    if (!k) continue;
    c[k]++;
    c.total++;
    if (k === 'porte_ext' || k === 'porte_int') c.portes++;
    if (o.host.kind === 'unplaced') c.aPositionner++;
  }
  return c;
}

export function addCounts(a: JoineryCounts, b: JoineryCounts): JoineryCounts {
  const out = emptyCounts();
  for (const k of Object.keys(out) as (keyof JoineryCounts)[]) out[k] = a[k] + b[k];
  return out;
}

// ---------------------------------------------------------------------------
// Calcul indicatif des détecteurs de choc et d'ouverture
// ---------------------------------------------------------------------------

export type OpeningAuditStatus = 'a_positionner' | 'proteger' | 'non_automatique' | 'interieure';

export const OPENING_AUDIT_LABELS: Record<OpeningAuditStatus, string> = {
  a_positionner: 'Position à définir',
  proteger: 'Ouverture extérieure à protéger',
  non_automatique: 'Pas de détecteur automatique (à étudier)',
  interieure: 'Intérieure : pas de protection proposée',
};

/** Quantité indicative de détecteurs de choc/ouverture pour une ouverture. */
export function openingDetectors(o: Opening, rules: RulesConfig): number {
  if (!o.exterior || o.type === 'porte_interieure' || o.type === 'passage') return 0;
  if (o.type === 'porte_garage' && o.sectional && rules.shock.skipSectional) return 0;
  if (o.type === 'baie') return rules.shock.perBay;
  return rules.shock.perOpening;
}

export function openingAuditStatus(o: Opening, rules: RulesConfig): OpeningAuditStatus {
  if (!o.exterior || o.type === 'porte_interieure' || o.type === 'passage') return 'interieure';
  if (openingDetectors(o, rules) === 0) return 'non_automatique';
  if (o.host.kind === 'unplaced') return 'a_positionner';
  return 'proteger';
}

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);
const TYPE_NOUN: Record<OpeningType, [string, string]> = {
  porte: ['porte extérieure', 'portes extérieures'],
  fenetre: ['fenêtre', 'fenêtres'],
  porte_fenetre: ['porte-fenêtre', 'portes-fenêtres'],
  baie: ['baie vitrée', 'baies vitrées'],
  porte_garage: ['porte de garage', 'portes de garage'],
  porte_interieure: ['porte intérieure', 'portes intérieures'],
  passage: ['passage', 'passages'],
  autre: ['autre ouverture', 'autres ouvertures'],
};

export interface RoomDetectorCalc {
  detectors: number;
  /** Ex. « Séjour : 2 fenêtres × 1 détecteur + 1 baie vitrée × 2 détecteurs = 4 détecteurs indicatifs. » */
  explanation: string;
  excluded: string[];
}

/** Détail lisible du calcul indicatif pour une pièce (toutes ses menuiseries extérieures). */
export function roomDetectorCalc(roomName: string, openings: Opening[], rules: RulesConfig): RoomDetectorCalc {
  const groups = new Map<string, { type: OpeningType; per: number; n: number }>();
  const excluded: string[] = [];
  for (const o of openings) {
    if (!o.exterior || o.type === 'porte_interieure' || o.type === 'passage') continue;
    const per = openingDetectors(o, rules);
    if (per === 0) {
      excluded.push(`${o.code} (${o.type === 'porte_garage' ? 'porte de garage sectionnelle' : OPENING_TYPE_LABELS[o.type].toLowerCase()}) : pas de détecteur automatique`);
      continue;
    }
    const key = `${o.type}:${per}`;
    const g = groups.get(key) ?? { type: o.type, per, n: 0 };
    g.n++;
    groups.set(key, g);
  }
  const parts = [...groups.values()].map((g) => `${g.n} ${plural(g.n, TYPE_NOUN[g.type][0], TYPE_NOUN[g.type][1])} × ${g.per} ${plural(g.per, 'détecteur', 'détecteurs')}`);
  const detectors = [...groups.values()].reduce((s, g) => s + g.n * g.per, 0);
  const explanation = parts.length
    ? `${roomName} : ${parts.join(' + ')} = ${detectors} ${plural(detectors, 'détecteur indicatif', 'détecteurs indicatifs')}.`
    : `${roomName} : aucune menuiserie extérieure à équiper.`;
  return { detectors, explanation, excluded };
}

// ---------------------------------------------------------------------------
// Modifications (sur un brouillon du dossier)
// ---------------------------------------------------------------------------

export function newUnplacedOpening(plan: Plan, level: Level, roomId: string, kind: JoineryKind): Opening {
  const t = typeForKind(kind);
  return {
    id: uid('op'),
    code: nextOpeningCode(plan, level),
    type: t.type,
    host: { kind: 'unplaced', roomId },
    offset: 0,
    width: OPENING_DEFAULT_WIDTH[t.type],
    exterior: t.exterior,
    sectional: false,
    positionConfirmed: false,
  };
}

/**
 * Fixe le nombre d'ouvertures d'une colonne pour une pièce.
 * Ajout : ouvertures « à positionner ». Retrait : d'abord les non positionnées, puis les plus récentes.
 * Retourne le nombre d'ouvertures positionnées supprimées (pour avertir le conseiller).
 */
export function setRoomCount(draft: Draft, levelId: string, roomId: string, kind: JoineryKind, target: number): number {
  const level = draft.plan.levels.find((l) => l.id === levelId);
  if (!level) throw new Error('Niveau introuvable');
  if (!Number.isInteger(target) || target < 0) throw new Error('La quantité doit être un nombre entier positif ou nul.');
  const current = roomOpenings(level, roomId).filter((o) => joineryKind(o) === kind);
  let removedPlaced = 0;
  if (target > current.length) {
    for (let i = current.length; i < target; i++) level.openings.push(newUnplacedOpening(draft.plan, level, roomId, kind));
  } else if (target < current.length) {
    const order = [...current].sort((a, b) => (a.host.kind === 'unplaced' ? 0 : 1) - (b.host.kind === 'unplaced' ? 0 : 1) || level.openings.indexOf(b) - level.openings.indexOf(a));
    const remove = new Set(order.slice(0, current.length - target).map((o) => o.id));
    removedPlaced = order.slice(0, current.length - target).filter((o) => o.host.kind !== 'unplaced').length;
    level.openings = level.openings.filter((o) => !remove.has(o.id));
    unlinkDevices(draft, remove);
  }
  return removedPlaced;
}

export function unlinkDevices(draft: Draft, removedOpeningIds: Set<string>) {
  // suggestions non validées liées à une ouverture supprimée : retirées ; autres équipements : conservés, détachés
  draft.devices = draft.devices
    .filter((d) => !(d.openingId && removedOpeningIds.has(d.openingId) && d.origin === 'suggere' && !d.validated))
    .map((d) => (d.openingId && removedOpeningIds.has(d.openingId) ? { ...d, openingId: undefined } : d));
}

/** Point intérieur proche d'une ouverture (pour poser ou déplacer un détecteur). */
export function openingDevicePoint(level: Level, o: Opening): { x: number; y: number; rotation: number } | null {
  const pl = openingPlacement(level, o);
  if (pl && o.host.kind === 'room') {
    const n = sideNormal(o.host.side);
    return { x: pl.center.x - n.x * 0.15, y: pl.center.y - n.y * 0.15, rotation: (Math.atan2(-n.y, -n.x) * 180) / Math.PI };
  }
  if (pl) return { x: pl.center.x, y: pl.center.y, rotation: (pl.angle * 180) / Math.PI };
  const room = level.rooms.find((r) => o.host.kind === 'unplaced' && r.id === o.host.roomId);
  if (!room) return null;
  const others = level.openings.filter((x) => x.host.kind === 'unplaced' && x.host.roomId === room.id);
  const i = Math.max(0, others.indexOf(o));
  return { x: room.x + room.w - 0.4, y: room.y + 0.4 + (i % 6) * 0.45, rotation: 0 };
}

/**
 * Positionne une ouverture sur le mur le plus proche du point cliqué
 * (de préférence un côté de sa pièce de rattachement). La position devient « confirmée ».
 */
export function placeOpeningAt(draft: Draft, levelId: string, openingId: string, p: Point, maxDistance = 0.8): boolean {
  const level = draft.plan.levels.find((l) => l.id === levelId);
  const o = level?.openings.find((x) => x.id === openingId);
  if (!level || !o) return false;
  const roomId = openingRoomId(level, o);
  const room = level.rooms.find((r) => r.id === roomId);
  let host: Opening['host'] | null = null;
  let offset = 0;
  let len = 0;
  if (room) {
    // côté de la pièce de rattachement le plus proche
    const best = (['N', 'S', 'E', 'W'] as const)
      .map((side) => {
        const seg = roomSideSegment(room, side);
        const proj = projectOnSegment(p, seg);
        return { side, seg, proj };
      })
      .sort((a, b) => a.proj.distance - b.proj.distance)[0];
    if (best.proj.distance <= maxDistance) {
      host = { kind: 'room', roomId: room.id, side: best.side };
      len = segmentLength(best.seg);
      offset = best.proj.t * len;
    }
  }
  if (!host) {
    const cand = nearestHost(level, p, maxDistance);
    if (!cand) return false;
    host = cand.host;
    len = segmentLength(cand.segment);
    offset = cand.offset;
  }
  o.host = host;
  o.width = Math.min(o.width, Math.max(0.4, len - 0.1));
  o.offset = clampOffset(offset, o.width, len);
  o.positionConfirmed = true;
  if (host.kind === 'room' && o.type !== 'porte_interieure' && o.type !== 'passage') {
    const pl = openingPlacement(level, o);
    if (pl) o.exterior = isExteriorAt(level, host.roomId, host.side, pl.center) || o.exterior;
  }
  // les suggestions liées suivent l'ouverture
  const pt = openingDevicePoint(level, o);
  if (pt)
    draft.devices = draft.devices.map((d) => (d.openingId === o.id && d.origin === 'suggere' && !d.validated ? { ...d, x: pt.x, y: pt.y, rotation: pt.rotation } : d));
  return true;
}

/** Remet une ouverture « à positionner » (sans la supprimer). */
export function unplaceOpening(level: Level, o: Opening) {
  const roomId = openingRoomId(level, o);
  if (!roomId) return;
  o.host = { kind: 'unplaced', roomId };
  o.positionConfirmed = false;
}

/**
 * Met à jour la quantité des détecteurs SUGGÉRÉS (non validés) liés aux ouvertures,
 * pour qu'un changement de type ou une suppression soit immédiatement répercuté
 * sans double comptage. Les équipements manuels ou validés ne sont jamais modifiés.
 */
export function syncSuggestedOpeningDevices(draft: Draft, rules: RulesConfig) {
  const byId = new Map(draft.plan.levels.flatMap((l) => l.openings.map((o) => [o.id, o] as const)));
  const next: PlacedDevice[] = [];
  for (const d of draft.devices) {
    if (!d.openingId || d.origin !== 'suggere' || d.validated || !d.suggestionKey?.startsWith('choc:')) {
      next.push(d);
      continue;
    }
    const o = byId.get(d.openingId);
    const qty = o ? openingDetectors(o, rules) : 0;
    if (qty > 0) next.push(qty === d.quantity ? d : { ...d, quantity: qty });
  }
  draft.devices = next;
}

/** Duplique une pièce avec ses menuiseries (les ouvertures positionnées sont recopiées sur les mêmes côtés). */
export function duplicateRoomWithOpenings(draft: Draft, levelId: string, roomId: string): Room | null {
  const level = draft.plan.levels.find((l) => l.id === levelId);
  const src = level?.rooms.find((r) => r.id === roomId);
  if (!level || !src) return null;
  const spot = freeSpot(level, src.w, src.h);
  const copy = addRoom(level, { ...spot, w: src.w, h: src.h }, src.type, `${src.name} (copie)`);
  copy.openPlan = src.openPlan;
  copy.comment = src.comment;
  for (const o of roomOpenings(level, src.id)) {
    const clone: Opening = { ...structuredClone(o), id: uid('op'), code: nextOpeningCode(draft.plan, level) };
    clone.host = o.host.kind === 'room' ? { ...o.host, roomId: copy.id } : { kind: 'unplaced', roomId: copy.id };
    if (clone.host.kind === 'unplaced') clone.positionConfirmed = false;
    level.openings.push(clone);
  }
  // mobilier recopié au même emplacement relatif
  const dx = copy.x - src.x;
  const dy = copy.y - src.y;
  const furniture = (level.furniture ?? []).filter((f) => f.roomId === src.id);
  level.furniture = [...(level.furniture ?? []), ...furniture.map((f) => ({ ...structuredClone(f), id: uid('fur'), roomId: copy.id, x: f.x + dx, y: f.y + dy }))];
  return copy;
}

/** Copie les pièces et menuiseries d'un niveau vers un autre (remplace le contenu du niveau cible). */
export function copyLevelConfiguration(draft: Draft, fromId: string, toId: string) {
  const from = draft.plan.levels.find((l) => l.id === fromId);
  const to = draft.plan.levels.find((l) => l.id === toId);
  if (!from || !to || from === to) throw new Error('Choisissez deux niveaux différents.');
  const removed = new Set(to.openings.map((o) => o.id));
  to.rooms = [];
  to.openings = [];
  to.walls = structuredClone(from.walls).map((w) => ({ ...w, id: uid('wall') }));
  const roomMap = new Map<string, string>();
  for (const r of from.rooms) {
    const id = uid('room');
    roomMap.set(r.id, id);
    to.rooms.push({ ...structuredClone(r), id });
  }
  const wallMap = new Map(from.walls.map((w, i) => [w.id, to.walls[i].id]));
  for (const o of from.openings) {
    const host: Opening['host'] =
      o.host.kind === 'wall' ? { kind: 'wall', wallId: wallMap.get(o.host.wallId)! } : { ...o.host, roomId: roomMap.get(o.host.roomId)! };
    to.openings.push({ ...structuredClone(o), id: uid('op'), code: nextOpeningCode(draft.plan, to), host });
  }
  to.furniture = (from.furniture ?? []).map((f) => ({ ...structuredClone(f), id: uid('fur'), roomId: f.roomId ? (roomMap.get(f.roomId) ?? null) : null }));
  draft.devices = draft.devices.filter((d) => d.levelId !== to.id || !(d.openingId && removed.has(d.openingId)));
}
