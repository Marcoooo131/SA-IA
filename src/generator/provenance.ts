import type { Level, Opening, PlanGeneration, Room } from '@/domain/types';
import { roomsOverlap } from '@/plan/geometry';
import { furnishOptions, furnishRoom } from '@/furniture/placement';

/**
 * Provenance des éléments d'un plan généré :
 *  - « questionnaire » : découle directement d'une réponse (chambres, garage, fenêtres…) ;
 *  - « genere » : ajouté automatiquement pour la cohérence (couloir, portes intérieures…) ;
 *  - « conseiller » : ajouté ou modifié par le conseiller après la génération.
 * Calculée par comparaison avec le plan de référence (baseline) : aucune donnée
 * supplémentaire à maintenir lors des modifications.
 */
export type Provenance = 'questionnaire' | 'genere' | 'conseiller';

export const PROVENANCE_LABELS: Record<Provenance, string> = {
  questionnaire: 'Issu du questionnaire',
  genere: 'Généré automatiquement',
  conseiller: 'Corrigé par le conseiller',
};

export const PROVENANCE_COLORS: Record<Provenance, string> = {
  questionnaire: '#7c3aed',
  genere: '#64748b',
  conseiller: '#059669',
};

const sameRoom = (a: Room, b: Room) =>
  a.name === b.name && a.type === b.type && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.w - b.w) < 0.01 && Math.abs(a.h - b.h) < 0.01;

const sameOpening = (a: Opening, b: Opening) =>
  a.type === b.type &&
  a.exterior === b.exterior &&
  a.sectional === b.sectional &&
  Math.abs(a.offset - b.offset) < 0.01 &&
  Math.abs(a.width - b.width) < 0.01 &&
  JSON.stringify(a.host) === JSON.stringify(b.host);

export function provenanceMap(levels: Level[], gen: PlanGeneration | null): Map<string, Provenance> {
  const out = new Map<string, Provenance>();
  if (!gen) return out;
  const baseRooms = new Map(gen.baseline.flatMap((l) => l.rooms.map((r) => [r.id, r] as const)));
  const baseOpenings = new Map(gen.baseline.flatMap((l) => l.openings.map((o) => [o.id, o] as const)));
  const fromAnswers = new Set(gen.fromAnswers);
  for (const l of levels) {
    for (const r of l.rooms) {
      const b = baseRooms.get(r.id);
      out.set(r.id, !b || !sameRoom(b, r) ? 'conseiller' : fromAnswers.has(r.id) ? 'questionnaire' : 'genere');
    }
    for (const o of l.openings) {
      const b = baseOpenings.get(o.id);
      out.set(o.id, !b || !sameOpening(b, o) ? 'conseiller' : fromAnswers.has(o.id) ? 'questionnaire' : 'genere');
    }
    for (const w of l.walls) out.set(w.id, 'conseiller');
  }
  return out;
}

/** Le plan actuel diffère-t-il du plan généré (corrections du conseiller) ? */
export function hasManualChanges(levels: Level[], gen: PlanGeneration | null): boolean {
  if (!gen) return levels.some((l) => l.rooms.length > 0);
  const prov = provenanceMap(levels, gen);
  if ([...prov.values()].includes('conseiller')) return true;
  if (levels.some((l) => (l.furniture ?? []).some((f) => f.origin === 'manuel'))) return true;
  // éléments supprimés
  const ids = new Set(levels.flatMap((l) => [...l.rooms.map((r) => r.id), ...l.openings.map((o) => o.id)]));
  return gen.baseline.some((l) => l.rooms.some((r) => !ids.has(r.id)) || l.openings.some((o) => !ids.has(o.id))) || levels.length !== gen.baseline.length;
}

/**
 * Régénération en conservant les corrections du conseiller :
 * on part du nouveau plan généré, puis on réapplique les ajouts, modifications
 * et suppressions faits sur l'ancien plan (identifiants stables par rôle).
 */
export function mergeWithCorrections(current: Level[], oldGen: PlanGeneration, generated: Level[]): { levels: Level[]; notes: string[] } {
  const notes: string[] = [];
  const levels: Level[] = structuredClone(generated);
  const oldRooms = new Map(oldGen.baseline.flatMap((l) => l.rooms.map((r) => [r.id, r] as const)));
  const oldOpenings = new Map(oldGen.baseline.flatMap((l) => l.openings.map((o) => [o.id, o] as const)));
  const currentIds = new Set(current.flatMap((l) => [...l.rooms.map((r) => r.id), ...l.openings.map((o) => o.id)]));

  for (const cur of current) {
    const target = levels.find((l) => l.index === cur.index);
    if (!target) {
      const added = cur.rooms.filter((r) => !oldRooms.has(r.id) || !sameRoom(oldRooms.get(r.id)!, r));
      if (added.length) notes.push(`${cur.name} n'existe plus dans le nouveau plan : ${added.length} pièce(s) corrigée(s) non reprise(s).`);
      continue;
    }
    target.background = cur.background;
    target.walls = [...target.walls, ...cur.walls];
    for (const r of cur.rooms) {
      const old = oldRooms.get(r.id);
      if (old && sameRoom(old, r)) continue; // inchangée : on garde la nouvelle version générée
      const i = target.rooms.findIndex((x) => x.id === r.id);
      if (i >= 0) {
        target.rooms[i] = structuredClone(r);
        continue;
      }
      if (target.rooms.some((x) => roomsOverlap(x, r))) notes.push(`« ${r.name} » (ajoutée par le conseiller) chevauche le nouveau plan : à repositionner.`);
      target.rooms.push(structuredClone(r));
    }
    for (const o of cur.openings) {
      const old = oldOpenings.get(o.id);
      if (old && sameOpening(old, o)) continue;
      const i = target.openings.findIndex((x) => x.id === o.id);
      if (i >= 0) target.openings[i] = structuredClone(o);
      else target.openings.push(structuredClone(o));
    }
  }
  // suppressions faites par le conseiller
  for (const l of levels) {
    l.rooms = l.rooms.filter((r) => !(oldRooms.has(r.id) && !currentIds.has(r.id)));
    l.openings = l.openings.filter((o) => !(oldOpenings.has(o.id) && !currentIds.has(o.id)));
    const roomIds = new Set(l.rooms.map((r) => r.id));
    const wallIds = new Set(l.walls.map((w) => w.id));
    l.openings = l.openings.filter((o) => (o.host.kind === 'wall' ? wallIds.has(o.host.wallId) : roomIds.has(o.host.roomId)));
    // codes d'ouverture uniques
    const seen = new Set<string>();
    for (const o of l.openings) {
      if (seen.has(o.code)) o.code = `${o.code}b`;
      seen.add(o.code);
    }
  }
  // mobilier : pièces aménagées à la main conservées telles quelles, les autres réaménagées
  const fopts = furnishOptions(levels);
  for (const l of levels) {
    const cur = current.find((c) => c.index === l.index);
    const curFurniture = cur?.furniture ?? [];
    const customized = new Set(curFurniture.filter((f) => f.origin === 'manuel').map((f) => f.roomId));
    const roomIds = new Set(l.rooms.map((r) => r.id));
    l.furniture = [
      ...curFurniture.filter((f) => customized.has(f.roomId) && (f.roomId === null || roomIds.has(f.roomId))).map((f) => structuredClone(f)),
      ...l.rooms.filter((r) => !customized.has(r.id)).flatMap((r) => furnishRoom(l, r, fopts)),
    ];
  }
  return { levels, notes };
}
