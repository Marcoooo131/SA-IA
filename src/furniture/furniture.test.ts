import { describe, expect, it } from 'vitest';
import { generatePlan } from '@/generator/generate';
import { TEMPLATES, getTemplate } from '@/generator/templates';
import { mergeWithCorrections } from '@/generator/provenance';
import { roomArea } from '@/plan/geometry';
import { addRoom } from '@/plan/actions';
import { runAudit } from '@/rules/engine';
import { DEFAULT_RULES_CONFIG } from '@/rules/config';
import { createDefaultCatalog } from '@/catalog/defaultCatalog';
import { emptyDossier, demoHouseDossier } from '@/demo/demoData';
import { dossierSchema } from '@/domain/schemas';
import type { FurnitureItem, HousingAnswers, Level, PlanGeneration, Room } from '@/domain/types';
import { FURNITURE_MODELS, getFurnitureModel } from './models';
import { furnishLevel, furnishOptions, furnishRoom, roomZones } from './placement';
import { footprint, innerRect, rectInside, rectsOverlap } from './geometry';
import { addFurniture, moveFurniture, resetRoomFurniture, rotateFurniture } from './actions';
import { furnitureTransform, partTransform } from './Furniture3D';
import { JOINERY_MODELS, joineryModelOf, joineryVertical } from './joineryModels';

const etage = getTemplate('maison_etage');
/** Maison avec salon, cuisine, chambres, salle de bain, entrée et garage. */
const house: HousingAnswers = {
  ...etage.defaults,
  surfaceBand: 'exacte',
  surfaceExact: 140,
  garage: 'attenant',
  features: { ...etage.defaults.features, garageCommunicating: true },
};

const models = (items: FurnitureItem[], room: Room) => items.filter((f) => f.roomId === room.id).map((f) => f.modelId);
const allRooms = (levels: Level[]) => levels.flatMap((l) => l.rooms.map((r) => ({ l, r })));

describe('bibliothèque de mobilier', () => {
  it('chaque modèle a un identifiant unique, des dimensions et des volumes cohérents', () => {
    const ids = new Set(FURNITURE_MODELS.map((m) => m.id));
    expect(ids.size).toBe(FURNITURE_MODELS.length);
    for (const m of FURNITURE_MODELS) {
      expect(m.w * m.d * m.h).toBeGreaterThan(0);
      expect(m.parts.length).toBeGreaterThan(0);
      for (const p of m.parts) {
        // volumes contenus dans l'emprise (tolérance de 5 % pour les roues et poignées)
        expect(p.x).toBeGreaterThanOrEqual(-0.05);
        expect(p.y).toBeGreaterThanOrEqual(-0.05);
        expect(p.x + p.w).toBeLessThanOrEqual(1.05);
        expect(p.y + p.d).toBeLessThanOrEqual(1.05);
      }
    }
  });

  it('les vues 2D et 3D partagent position, orientation et dimensions', () => {
    const item: FurnitureItem = { id: 'f', modelId: 'canape', roomId: null, x: 3.2, y: 1.4, rotation: 90, w: 2.1, d: 0.92, h: 0.85, origin: 'genere' };
    const t = furnitureTransform(item);
    expect(t.position).toEqual([3.2, 0, 1.4]);
    expect(t.rotationY).toBeCloseTo(-Math.PI / 2);
    const fp = footprint(item);
    // pivoté de 90° : largeur et profondeur échangées dans le plan
    expect(fp.x1 - fp.x0).toBeCloseTo(0.92);
    expect(fp.y1 - fp.y0).toBeCloseTo(2.1);
    // le volume d'assise est dans les dimensions de l'objet
    const seat = partTransform(getFurnitureModel('canape')!.parts[0], item.w, item.d, item.h);
    expect(seat.scale[0]).toBeCloseTo(2.1);
    expect(furnitureTransform({ ...item, modelId: 'televiseur' }).position[1]).toBe(0.5);
  });

  it('bibliothèque des menuiseries : modèles, représentation et hauteurs', () => {
    expect(JOINERY_MODELS.map((m) => m.id)).toEqual(
      expect.arrayContaining(['porte_interieure', 'porte_entree', 'porte_exterieure', 'porte_fenetre', 'fenetre_simple', 'fenetre_double', 'baie', 'porte_garage', 'autre']),
    );
    const base = { id: 'o', code: 'X', host: { kind: 'room' as const, roomId: 'r', side: 'N' as const }, offset: 1, exterior: true, sectional: false };
    expect(joineryModelOf({ ...base, type: 'fenetre', width: 0.6 })).toBe('fenetre_simple');
    expect(joineryModelOf({ ...base, type: 'fenetre', width: 1.2 })).toBe('fenetre_double');
    expect(joineryModelOf({ ...base, type: 'porte', width: 0.9, entry: true })).toBe('porte_entree');
    expect(joineryModelOf({ ...base, type: 'porte', width: 0.9 })).toBe('porte_exterieure');
    expect(joineryVertical({ ...base, type: 'fenetre', width: 1.2 }, 2.5).bottom).toBeGreaterThan(0.8);
    expect(joineryVertical({ ...base, type: 'porte_fenetre', width: 1.4 }, 2.5).bottom).toBe(0);
  });
});

describe('placement automatique du mobilier', () => {
  const r = generatePlan(etage, house);

  it('chaque pièce de la maison reçoit un mobilier adapté', () => {
    const items = r.levels.flatMap((l) => l.furniture ?? []);
    const byType = (type: Room['type']) => allRooms(r.levels).filter(({ r: room }) => room.type === type);
    const expectIn = (type: Room['type'], ...ids: string[]) => {
      const rooms = byType(type);
      expect(rooms.length).toBeGreaterThan(0);
      for (const { r: room } of rooms) for (const id of ids) expect(models(items, room), `${room.name} : ${id}`).toContain(id);
    };
    expectIn('sejour', 'canape', 'table_basse', 'meuble_tv', 'televiseur');
    expectIn('cuisine', 'evier', 'plaque_cuisson');
    expectIn('chambre', 'lit', 'armoire');
    expectIn('salle_de_bain', 'meuble_vasque', 'douche');
    expectIn('entree', 'meuble_chaussures');
    expectIn('garage', 'voiture');
    expectIn('wc', 'wc');
    // escalier : pas de mobilier
    for (const { r: room } of byType('escalier')) expect(models(items, room)).toEqual([]);
    expect(items.every((f) => f.origin === 'genere')).toBe(true);
  });

  it('une salle de bain suffisamment grande reçoit une douche ET une baignoire', () => {
    const items = r.levels.flatMap((l) => l.furniture ?? []);
    const bath = allRooms(r.levels).find(({ r: room }) => room.type === 'salle_de_bain')!.r;
    expect(roomArea(bath)).toBeGreaterThanOrEqual(7);
    expect(models(items, bath)).toEqual(expect.arrayContaining(['baignoire', 'douche']));
  });

  it('une petite salle de bain ne reçoit jamais baignoire et douche ensemble', () => {
    const small = generatePlan(getTemplate('appt_t3'), getTemplate('appt_t3').defaults);
    const bath = allRooms(small.levels).find(({ r: room }) => room.type === 'salle_de_bain')!.r;
    const ids = models(small.levels.flatMap((l) => l.furniture ?? []), bath);
    expect(ids).toContain('douche');
    expect(ids).not.toContain('baignoire');
  });

  it('le mobilier s’adapte aux petites pièces (variante réduite ou objets secondaires retirés)', () => {
    const level: Level = { id: 'l', name: 'RDC', index: 0, height: 2.5, rooms: [], walls: [], openings: [], background: null, furniture: [] };
    const small = addRoom(level, { x: 0, y: 0, w: 2.3, h: 2.8 }, 'chambre', 'Petite chambre');
    const big = addRoom(level, { x: 3, y: 0, w: 4, h: 4 }, 'chambre', 'Grande chambre');
    const tiny = addRoom(level, { x: 0, y: 3, w: 1.0, h: 1.0 }, 'chambre', 'Réduit');
    const items = furnishLevel(level);
    const bed = (room: Room) => items.find((f) => f.roomId === room.id && f.modelId === 'lit');
    expect(bed(small)?.variant).toBe('90');
    expect(bed(big)?.variant).toBe('160');
    expect(items.filter((f) => f.roomId === small.id).length).toBeLessThan(items.filter((f) => f.roomId === big.id).length);
    // pièce trop petite : aucun objet forcé, dimensions de la pièce inchangées
    expect(items.filter((f) => f.roomId === tiny.id)).toEqual([]);
    expect(tiny.w).toBe(1.0);
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))('modèle %s : meubles dans les murs, sans chevauchement, accès dégagés', (_id, t) => {
    const res = generatePlan(t, t.defaults);
    for (const l of res.levels) {
      for (const room of l.rooms) {
        const inner = innerRect(room);
        const zones = roomZones(l, room).filter((z) => z.kind === 'porte');
        const mine = (l.furniture ?? []).filter((f) => f.roomId === room.id);
        const floor = mine.filter((f) => getFurnitureModel(f.modelId)!.layer === 'sol');
        for (const f of mine) expect(rectInside(footprint(f), inner), `${room.name} ${f.modelId} hors des murs`).toBe(true);
        for (const f of floor) for (const z of zones) expect(rectsOverlap(footprint(f), z.rect), `${room.name} ${f.modelId} devant une porte`).toBe(false);
        for (let i = 0; i < floor.length; i++)
          for (let j = i + 1; j < floor.length; j++) expect(rectsOverlap(footprint(floor[i]), footprint(floor[j])), `${floor[i].modelId} / ${floor[j].modelId}`).toBe(false);
      }
    }
  });

  it('est déterministe : même plan, même mobilier', () => {
    const a = generatePlan(etage, house).levels.map((l) => l.furniture);
    const b = generatePlan(etage, house).levels.map((l) => l.furniture);
    expect(a).toEqual(b);
  });

  it('studio : le couchage est placé dans la pièce de vie', () => {
    const s = generatePlan(getTemplate('studio'), getTemplate('studio').defaults);
    expect(s.levels.flatMap((l) => l.furniture ?? []).some((f) => f.modelId === 'lit')).toBe(true);
  });

  it('le mobilier n’a aucun effet sur l’audit ni sur les quantités de menuiseries', () => {
    const catalog = createDefaultCatalog();
    const d = demoHouseDossier(catalog);
    expect(d.plan.levels.some((l) => (l.furniture ?? []).length > 0)).toBe(true);
    const withF = runAudit(d, DEFAULT_RULES_CONFIG, catalog.products);
    const without = runAudit({ ...d, plan: { levels: d.plan.levels.map((l) => ({ ...l, furniture: [] })) } }, DEFAULT_RULES_CONFIG, catalog.products);
    const strip = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'furniture' ? undefined : v)));
    expect(strip(withF.inventory)).toEqual(strip(without.inventory));
    expect(strip(withF.proposals)).toEqual(strip(without.proposals));
    expect(withF.alerts.map((a) => a.id)).toEqual(without.alerts.map((a) => a.id));
    expect(withF.rooms.map((x) => x.counts)).toEqual(without.rooms.map((x) => x.counts));
  });
});

describe('modification manuelle du mobilier', () => {
  it('déplacer, pivoter, ajouter : l’objet devient « modifié » et suit sa pièce', () => {
    const level = structuredClone(generatePlan(etage, house).levels[0]);
    const sofa = level.furniture!.find((f) => f.modelId === 'canape')!;
    const kitchen = level.rooms.find((x) => x.type === 'cuisine')!;
    moveFurniture(level, sofa.id, kitchen.x + 1, kitchen.y + 1);
    expect(sofa.roomId).toBe(kitchen.id);
    expect(sofa.origin).toBe('manuel');
    rotateFurniture(level, sofa.id, -90);
    expect(sofa.rotation).toBe((((sofa.rotation % 360) + 360) % 360));
    const plant = addFurniture(level, 'plante', { room: kitchen })!;
    expect(plant.roomId).toBe(kitchen.id);
    expect(rectInside(footprint(plant), innerRect(kitchen))).toBe(true);
  });

  it('« Réinitialiser le mobilier » ne restaure que la pièce choisie', () => {
    const levels = structuredClone(generatePlan(etage, house).levels);
    const level = levels[0];
    const living = level.rooms.find((x) => x.type === 'sejour')!;
    const kitchen = level.rooms.find((x) => x.type === 'cuisine')!;
    const original = structuredClone(level.furniture!.filter((f) => f.roomId === living.id));
    // corrections dans deux pièces
    const sofa = level.furniture!.find((f) => f.modelId === 'canape')!;
    moveFurniture(level, sofa.id, sofa.x + 0.4, sofa.y);
    const sink = level.furniture!.find((f) => f.modelId === 'evier')!;
    moveFurniture(level, sink.id, sink.x, sink.y + 0.2);
    resetRoomFurniture(levels, level, living.id);
    expect(level.furniture!.filter((f) => f.roomId === living.id)).toEqual(original);
    // la correction de la cuisine est conservée
    expect(level.furniture!.find((f) => f.id === sink.id)?.origin).toBe('manuel');
    expect(level.furniture!.filter((f) => f.roomId === kitchen.id).length).toBeGreaterThan(0);
  });

  it('régénération en conservant les corrections : les pièces aménagées à la main sont gardées', () => {
    const gen1 = generatePlan(etage, house);
    const current = structuredClone(gen1.levels);
    const sofa = current[0].furniture!.find((f) => f.modelId === 'canape')!;
    moveFurniture(current[0], sofa.id, sofa.x + 0.3, sofa.y);
    const generation: PlanGeneration = { templateId: etage.id, answers: house, generatedAt: '', baseline: structuredClone(gen1.levels), fromAnswers: [], validatedAt: null, warnings: [] };
    const gen2 = generatePlan(etage, { ...house, bedrooms: 4 });
    const merged = mergeWithCorrections(current, generation, gen2.levels);
    expect(merged.levels[0].furniture!.find((f) => f.id === sofa.id)?.x).toBeCloseTo(sofa.x);
  });

  it('enregistrement : le mobilier et les attributs de menuiserie passent la validation', () => {
    const d = emptyDossier('dos_f', 'MOV-TEST-0002');
    const plan = generatePlan(etage, house);
    d.plan.levels = plan.levels;
    d.plan.levels[0].openings[0].hinge = 'droite';
    d.plan.levels[0].openings[0].leaves = 2;
    const parsed = dossierSchema.parse(JSON.parse(JSON.stringify(d)));
    expect(parsed.plan.levels[0].furniture).toEqual(d.plan.levels[0].furniture);
    expect(parsed.plan.levels[0].openings[0].hinge).toBe('droite');
    // ancien dossier sans mobilier : migration par défaut
    const legacy = JSON.parse(JSON.stringify(d));
    delete legacy.plan.levels[0].furniture;
    expect(dossierSchema.parse(legacy).plan.levels[0].furniture).toEqual([]);
  });

  it('furnishRoom ne dépend que de la pièce (les autres pièces ne bougent pas)', () => {
    const level = structuredClone(generatePlan(etage, house).levels[0]);
    const before = structuredClone(level.furniture!);
    const room = level.rooms.find((x) => x.type === 'cuisine')!;
    const again = furnishRoom(level, room, furnishOptions([level]));
    expect(again).toEqual(before.filter((f) => f.roomId === room.id));
  });
});
