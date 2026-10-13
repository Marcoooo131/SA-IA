import { describe, expect, it } from 'vitest';
import { generatePlan, unreachableRooms } from './generate';
import { TEMPLATES, bestTemplateFor, getTemplate } from './templates';
import { hasManualChanges, mergeWithCorrections, provenanceMap } from './provenance';
import { roomsOverlap, buildWallSegments } from '@/plan/geometry';
import { runAudit } from '@/rules/engine';
import { DEFAULT_RULES_CONFIG } from '@/rules/config';
import { createDefaultCatalog } from '@/catalog/defaultCatalog';
import { emptyDossier } from '@/demo/demoData';
import type { HousingAnswers, PlanGeneration } from '@/domain/types';

const etage = getTemplate('maison_etage');
const scenario: HousingAnswers = {
  ...etage.defaults,
  surfaceBand: 'exacte',
  surfaceExact: 140,
  bedrooms: 3,
  kitchen: 'ouverte',
  garage: 'attenant',
  features: { ...etage.defaults.features, garageCommunicating: true },
};

describe('générateur de plans (déterministe)', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('modèle %s : plan cohérent, sans chevauchement ni pièce isolée', (_id, t) => {
    const r = generatePlan(t, t.defaults);
    expect(r.needsManualFix).toBe(false);
    for (const l of r.levels) {
      for (let i = 0; i < l.rooms.length; i++) for (let j = i + 1; j < l.rooms.length; j++) expect(roomsOverlap(l.rooms[i], l.rooms[j])).toBe(false);
      expect(l.rooms.every((x) => x.w >= 1 && x.h >= 1)).toBe(true);
    }
    expect(unreachableRooms(r.levels)).toEqual([]);
    // une seule porte d'entrée au minimum, codes d'ouverture uniques
    const codes = r.levels.flatMap((l) => l.openings.map((o) => o.code));
    expect(new Set(codes).size).toBe(codes.length);
    expect(r.stats.exteriorDoors).toBeGreaterThanOrEqual(1);
  });

  it('est déterministe : mêmes réponses, même plan', () => {
    expect(generatePlan(etage, scenario).levels).toEqual(generatePlan(etage, scenario).levels);
  });

  it('scénario « Maison à étage » : 3 chambres, cuisine ouverte, garage, escalier aligné', () => {
    const r = generatePlan(etage, scenario);
    expect(r.levels).toHaveLength(2);
    const all = r.levels.flatMap((l) => l.rooms);
    expect(all.filter((x) => x.type === 'chambre')).toHaveLength(3);
    expect(all.some((x) => x.type === 'garage')).toBe(true);
    const [s0, s1] = r.levels.map((l) => l.rooms.find((x) => x.type === 'escalier')!);
    expect([s0.x, s0.y, s0.w, s0.h]).toEqual([s1.x, s1.y, s1.w, s1.h]);
    const rdc = r.levels[0];
    const kitchen = rdc.rooms.find((x) => x.type === 'cuisine')!;
    expect(kitchen.openPlan).toBe(true);
    expect(rdc.openings.some((o) => o.type === 'passage' && o.host.kind === 'room' && o.host.roomId === kitchen.id)).toBe(true);
    // garage communicant : porte intérieure côté garage, porte sectionnelle non équipée automatiquement
    expect(rdc.openings.find((o) => o.id === 'gen_0_o_garage')).toMatchObject({ type: 'porte_garage', sectional: true, exterior: true });
    expect(rdc.openings.some((o) => o.id === 'gen_0_o_garage_int')).toBe(true);
    // surface proche de la demande
    expect(Math.abs(r.stats.habitableArea - 140) / 140).toBeLessThan(0.15);
    // les murs générés sont découpés aux ouvertures (pour la 3D)
    const cuts = buildWallSegments(rdc).flatMap((s) => s.cuts.map((c) => c.opening.id));
    for (const o of rdc.openings) expect(cuts).toContain(o.id);
  });

  it('respecte le nombre de fenêtres, baies et accès demandés quand la place le permet', () => {
    const r = generatePlan(getTemplate('maison_plainpied'), { ...getTemplate('maison_plainpied').defaults, windows: 5, bays: 2, exteriorAccesses: 3 });
    expect(r.stats).toMatchObject({ windows: 5, bays: 2, exteriorDoors: 3 });
  });

  it('signale ce qui ne peut pas être placé et demande une correction', () => {
    const r = generatePlan(getTemplate('studio'), { ...getTemplate('studio').defaults, windows: 30, comment: 'Mezzanine au-dessus de l’entrée' });
    expect(r.warnings.join(' ')).toMatch(/fenêtre\(s\) n'ont pas pu être placées/);
    expect(r.warnings.join(' ')).toMatch(/Mezzanine/);
  });

  it('choisit le modèle le plus proche pour un logement personnalisé', () => {
    expect(bestTemplateFor({ ...scenario }).id).toBe('maison_etage');
    expect(bestTemplateFor({ ...getTemplate('studio').defaults }).id).toBe('studio');
    expect(bestTemplateFor({ ...getTemplate('maison_plainpied').defaults, garage: 'separe' }).id).toBe('maison_garage_separe');
    const r = generatePlan('personnalise', scenario);
    expect(r.template.id).toBe('personnalise');
    expect(r.levels).toHaveLength(2);
  });

  it('transmet le plan au moteur d’audit (pièces, niveaux, ouvertures)', () => {
    const r = generatePlan(etage, scenario);
    const d = emptyDossier('d', 'MOV-T');
    d.plan.levels = r.levels;
    const audit = runAudit(d, DEFAULT_RULES_CONFIG, createDefaultCatalog().products);
    expect(audit.inventory.levels).toHaveLength(2);
    expect(audit.inventory.exteriorOpenings.length).toBe(r.stats.exteriorDoors + r.stats.windows + r.stats.bays + 1); // + porte de garage
    expect(audit.proposals.volumetrique.counts.detecteur_mouvement).toBeGreaterThanOrEqual(2);
    expect(audit.proposals.perimetrique.devices.some((x) => x.openingId === 'gen_0_o_garage')).toBe(false);
  });
});

describe('provenance et régénération', () => {
  const r = generatePlan(etage, scenario);
  const gen: PlanGeneration = {
    templateId: etage.id,
    answers: scenario,
    generatedAt: '2026-01-01T00:00:00.000Z',
    baseline: structuredClone(r.levels),
    fromAnswers: r.fromAnswers,
    validatedAt: null,
    warnings: [],
  };

  it('distingue éléments issus du questionnaire, générés et corrigés', () => {
    const levels = structuredClone(r.levels);
    let prov = provenanceMap(levels, gen);
    expect(prov.get('gen_1_ch1')).toBe('questionnaire');
    expect(prov.get('gen_0_couloir')).toBe(scenario.corridor ? 'questionnaire' : 'genere');
    expect(prov.get('gen_0_wc')).toBe('genere');
    expect(hasManualChanges(levels, gen)).toBe(false);
    levels[1].rooms.find((x) => x.id === 'gen_1_ch1')!.w += 0.5;
    prov = provenanceMap(levels, gen);
    expect(prov.get('gen_1_ch1')).toBe('conseiller');
    expect(hasManualChanges(levels, gen)).toBe(true);
  });

  it('régénère en conservant les corrections (modification, ajout, suppression)', () => {
    const current = structuredClone(r.levels);
    const ch1 = current[1].rooms.find((x) => x.id === 'gen_1_ch1')!;
    ch1.name = 'Chambre parentale';
    current[0].openings = current[0].openings.filter((o) => o.id !== 'gen_0_o_fen_0');
    current[0].openings.push({ id: 'manual_win', code: 'RDC-O99', type: 'fenetre', host: { kind: 'room', roomId: 'gen_0_sejour', side: 'S' }, offset: 1, width: 1, exterior: true, sectional: false });
    const regenerated = generatePlan(etage, { ...scenario, windows: scenario.windows + 1 });
    const merged = mergeWithCorrections(current, gen, regenerated.levels);
    const all = merged.levels.flatMap((l) => [...l.rooms.map((x) => x.id), ...l.openings.map((o) => o.id)]);
    expect(merged.levels[1].rooms.find((x) => x.id === 'gen_1_ch1')!.name).toBe('Chambre parentale');
    expect(all).toContain('manual_win');
    expect(all).not.toContain('gen_0_o_fen_0');
  });

  it('ajoute les pièces principales supplémentaires demandées (bureau…)', () => {
    const t = getTemplate('maison_plainpied');
    const base = generatePlan(t, { ...t.defaults, bedrooms: 3, mainRooms: 4 });
    const more = generatePlan(t, { ...t.defaults, bedrooms: 3, mainRooms: 6 });
    const offices = (r: typeof base) => r.levels.flatMap((l) => l.rooms).filter((x) => x.type === 'bureau').length;
    expect(offices(base)).toBe(0);
    expect(offices(more)).toBe(2);
    expect(unreachableRooms(more.levels)).toEqual([]);
    const tooFew = generatePlan(t, { ...t.defaults, bedrooms: 3, mainRooms: 2 });
    expect(tooFew.levels.flatMap((l) => l.rooms).filter((x) => x.type === 'chambre')).toHaveLength(3);
    expect(tooFew.warnings.join(' ')).toMatch(/pièces principales/);
  });

  it('change le nombre de chambres d’une maison à 2 niveaux', () => {
    const r3 = generatePlan(etage, etage.defaults);
    const r4 = generatePlan(etage, { ...etage.defaults, bedrooms: 4, mainRooms: 5 });
    const ch = (r: typeof r3) => r.levels.flatMap((l) => l.rooms).filter((x) => x.type === 'chambre').length;
    expect(r3.levels).toHaveLength(2);
    expect(ch(r3)).toBe(3);
    expect(ch(r4)).toBe(4);
  });
});
