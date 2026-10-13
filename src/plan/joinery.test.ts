import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultCatalog } from '@/catalog/defaultCatalog';
import { emptyDossier } from '@/demo/demoData';
import { DEFAULT_RULES_CONFIG } from '@/rules/config';
import { runAudit } from '@/rules/engine';
import { applyProposal } from '@/rules/apply';
import { generatePlan } from '@/generator/generate';
import { getTemplate } from '@/generator/templates';
import { quoteForDossier } from '@/quote/compare';
import { createQuoteRecord } from '@/quote/snapshot';
import { useApp, setRepository } from '@/state/store';
import { createLocalRepository } from '@/persistence/storage';
import { addRoom, findLevel, removeOpening } from './actions';
import type { Dossier, Level } from '@/domain/types';
import {
  copyLevelConfiguration,
  countOpenings,
  duplicateRoomWithOpenings,
  openingDetectors,
  placeOpeningAt,
  roomDetectorCalc,
  roomOpenings,
  setRoomCount,
  syncSuggestedOpeningDevices,
} from './joinery';

const catalog = createDefaultCatalog();
const rules = DEFAULT_RULES_CONFIG;

/** Dossier vide avec un niveau et une pièce « Séjour » de 5 × 4 m en (0,0). */
function dossierWithRoom(): { d: Dossier; level: Level; roomId: string } {
  const d = emptyDossier('dos_test', 'MOV-TEST-0001');
  const level = d.plan.levels[0];
  const room = addRoom(level, { x: 0, y: 0, w: 5, h: 4 }, 'sejour', 'Séjour');
  return { d, level, roomId: room.id };
}

describe('menuiseries par pièce', () => {
  it('accepte des quantités nulles sans créer d’ouverture', () => {
    const { d, level, roomId } = dossierWithRoom();
    for (const k of ['porte_ext', 'porte_int', 'fenetre', 'baie', 'autre_ext'] as const) setRoomCount(d, level.id, roomId, k, 0);
    expect(level.openings).toHaveLength(0);
    const c = countOpenings(roomOpenings(level, roomId));
    expect(c.total).toBe(0);
    expect(roomDetectorCalc('Séjour', [], rules).explanation).toMatch(/aucune menuiserie extérieure/);
  });

  it('refuse les saisies invalides (négatives ou décimales)', () => {
    const { d, level, roomId } = dossierWithRoom();
    expect(() => setRoomCount(d, level.id, roomId, 'fenetre', -1)).toThrow(/entier/);
    expect(() => setRoomCount(d, level.id, roomId, 'fenetre', 1.5)).toThrow(/entier/);
    expect(() => setRoomCount(d, level.id, roomId, 'fenetre', Number.NaN)).toThrow();
    expect(level.openings).toHaveLength(0);
  });

  it('crée des ouvertures « à positionner » et explique le calcul des détecteurs', () => {
    const { d, level, roomId } = dossierWithRoom();
    setRoomCount(d, level.id, roomId, 'fenetre', 2);
    setRoomCount(d, level.id, roomId, 'baie', 1);
    setRoomCount(d, level.id, roomId, 'porte_int', 1);
    const ops = roomOpenings(level, roomId);
    expect(ops).toHaveLength(4);
    expect(ops.every((o) => o.host.kind === 'unplaced' && o.positionConfirmed === false)).toBe(true);
    expect(new Set(ops.map((o) => o.code)).size).toBe(4);
    const calc = roomDetectorCalc('Séjour', ops, rules);
    expect(calc.detectors).toBe(4);
    expect(calc.explanation).toBe('Séjour : 2 fenêtres × 1 détecteur + 1 baie vitrée × 2 détecteurs = 4 détecteurs indicatifs.');
  });

  it('exclut porte de garage sectionnelle et ouvertures intérieures', () => {
    const { d, level, roomId } = dossierWithRoom();
    setRoomCount(d, level.id, roomId, 'porte_ext', 1);
    const garage = roomOpenings(level, roomId)[0];
    garage.type = 'porte_garage';
    garage.sectional = true;
    setRoomCount(d, level.id, roomId, 'porte_int', 2);
    const calc = roomDetectorCalc('Garage', roomOpenings(level, roomId), rules);
    expect(calc.detectors).toBe(0);
    expect(calc.excluded[0]).toMatch(/sectionnelle/);
  });

  it('diminue une quantité en retirant d’abord les ouvertures non positionnées', () => {
    const { d, level, roomId } = dossierWithRoom();
    setRoomCount(d, level.id, roomId, 'fenetre', 3);
    const first = roomOpenings(level, roomId)[0];
    expect(placeOpeningAt(d, level.id, first.id, { x: 2.5, y: 0 })).toBe(true);
    const removedPlaced = setRoomCount(d, level.id, roomId, 'fenetre', 1);
    expect(removedPlaced).toBe(0);
    const left = roomOpenings(level, roomId);
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(first.id);
    expect(left[0].host.kind).toBe('room');
  });

  it('positionne une ouverture sur un côté de sa pièce, sans la dupliquer', () => {
    const { d, level, roomId } = dossierWithRoom();
    setRoomCount(d, level.id, roomId, 'fenetre', 1);
    const o = roomOpenings(level, roomId)[0];
    expect(placeOpeningAt(d, level.id, o.id, { x: 20, y: 20 })).toBe(false);
    expect(placeOpeningAt(d, level.id, o.id, { x: 5.1, y: 2 })).toBe(true);
    expect(o.host).toEqual({ kind: 'room', roomId, side: 'E' });
    expect(o.positionConfirmed).toBe(true);
    expect(o.exterior).toBe(true);
    expect(level.openings).toHaveLength(1);
    expect(countOpenings(roomOpenings(level, roomId)).aPositionner).toBe(0);
  });

  it('ne compte pas deux fois une ouverture positionnée et met à jour les détecteurs suggérés', () => {
    const { d, level, roomId } = dossierWithRoom();
    setRoomCount(d, level.id, roomId, 'fenetre', 2);
    const audit1 = runAudit(d, rules, catalog.products);
    expect(audit1.inventory.exteriorOpenings).toHaveLength(2);
    d.devices = applyProposal(d.devices, audit1.proposals.perimetrique, catalog.products);
    const shock = () => d.devices.filter((x) => x.openingId).reduce((s, x) => s + x.quantity, 0);
    expect(shock()).toBe(2);

    // positionner une fenêtre : toujours 2 ouvertures, 2 détecteurs
    const [a, b] = roomOpenings(level, roomId);
    placeOpeningAt(d, level.id, a.id, { x: 2, y: -0.05 });
    syncSuggestedOpeningDevices(d, rules);
    expect(runAudit(d, rules, catalog.products).inventory.exteriorOpenings).toHaveLength(2);
    expect(shock()).toBe(2);

    // changement de type : fenêtre -> baie vitrée (2 détecteurs)
    a.type = 'baie';
    syncSuggestedOpeningDevices(d, rules);
    expect(shock()).toBe(3);
    expect(openingDetectors(a, rules)).toBe(2);

    // suppression : le détecteur suggéré lié disparaît
    removeOpening(d, level, b.id);
    syncSuggestedOpeningDevices(d, rules);
    expect(shock()).toBe(2);
    expect(runAudit(d, rules, catalog.products).inventory.exteriorOpenings).toHaveLength(1);
  });

  it('signale les ouvertures à positionner dans l’audit', () => {
    const { d, level, roomId } = dossierWithRoom();
    setRoomCount(d, level.id, roomId, 'fenetre', 1);
    const r = runAudit(d, rules, catalog.products);
    expect(r.alerts.find((x) => x.id === 'menuiseries:a-positionner')?.status).toBe('manquant');
    expect(r.rooms.find((x) => x.roomId === roomId)?.calc.detectors).toBe(1);
    placeOpeningAt(d, level.id, roomOpenings(level, roomId)[0].id, { x: 0, y: 2 });
    expect(runAudit(d, rules, catalog.products).alerts.find((x) => x.id === 'menuiseries:a-positionner')).toBeUndefined();
  });

  it('duplique une pièce avec ses menuiseries (nouveaux identifiants)', () => {
    const { d, level, roomId } = dossierWithRoom();
    setRoomCount(d, level.id, roomId, 'fenetre', 2);
    placeOpeningAt(d, level.id, roomOpenings(level, roomId)[0].id, { x: 2, y: 0 });
    const copy = duplicateRoomWithOpenings(d, level.id, roomId)!;
    const ops = roomOpenings(level, copy.id);
    expect(ops).toHaveLength(2);
    expect(ops.filter((o) => o.host.kind === 'room')).toHaveLength(1);
    expect(new Set(level.openings.map((o) => o.id)).size).toBe(4);
    expect(new Set(level.openings.map((o) => o.code)).size).toBe(4);
  });

  it('copie la configuration d’un niveau vers un autre', () => {
    const d = emptyDossier('dos_test', 'MOV-TEST-0001');
    const plan = generatePlan('maison_etage', getTemplate('maison_etage').defaults);
    d.plan.levels = plan.levels;
    const [rdc, etage] = d.plan.levels;
    copyLevelConfiguration(d, rdc.id, etage.id);
    expect(etage.rooms.map((r) => r.name)).toEqual(rdc.rooms.map((r) => r.name));
    expect(etage.openings).toHaveLength(rdc.openings.length);
    const ids = new Set(rdc.openings.map((o) => o.id));
    expect(etage.openings.some((o) => ids.has(o.id))).toBe(false);
    const rdcRooms = new Set(rdc.rooms.map((r) => r.id));
    expect(etage.openings.every((o) => !('roomId' in o.host) || !rdcRooms.has(o.host.roomId))).toBe(true);
    expect(() => copyLevelConfiguration(d, rdc.id, rdc.id)).toThrow();
  });
});

describe('menuiseries et devis (store)', () => {
  beforeEach(() => {
    localStorage.clear();
    setRepository(createLocalRepository(localStorage));
    useApp.getState().resetDemo();
  });

  it('modifier les menuiseries après le devis ne change pas le devis émis, mais recalcule le suivant', () => {
    const s = useApp.getState();
    const id = s.createDossier({ clientName: 'Client fictif' });
    s.openDossier(id);
    const levelId = useApp.getState().activeLevelId!;
    let roomId = '';
    s.mutate((d) => void (roomId = addRoom(findLevel(d, levelId), { x: 0, y: 0, w: 5, h: 4 }, 'sejour', 'Séjour').id));
    s.mutate((d) => void setRoomCount(d, levelId, roomId, 'fenetre', 2));
    s.applyModeProposal('perimetrique');
    const dossier = () => useApp.getState().dossiers.find((x) => x.id === id)!;
    const q1 = quoteForDossier(dossier(), useApp.getState().catalog);
    const record = createQuoteRecord(dossier(), q1, useApp.getState().catalog);
    useApp.getState().addQuoteRecord(record);
    const frozen = structuredClone(dossier().quotes[0]);

    // fenêtre -> baie : le mutate synchronise le détecteur suggéré (1 -> 2)
    const opId = dossier().plan.levels[0].openings[0].id;
    useApp.getState().mutate((d) => {
      findLevel(d, levelId).openings.find((o) => o.id === opId)!.type = 'baie';
    });
    const shock = dossier().devices.filter((x) => x.openingId).reduce((n, x) => n + x.quantity, 0);
    expect(shock).toBe(3);
    expect(dossier().quotes[0]).toEqual(frozen);
    const q2 = quoteForDossier(dossier(), useApp.getState().catalog);
    expect(q2.totals.initial).toBeGreaterThanOrEqual(q1.totals.initial);
  });

  it('refuse de valider un plan généré tant que des ouvertures restent à positionner', () => {
    const s = useApp.getState();
    const id = s.createDossier({ clientName: 'Client fictif' });
    s.openDossier(id);
    const levelId = useApp.getState().activeLevelId!;
    let roomId = '';
    s.mutate((d) => void (roomId = addRoom(findLevel(d, levelId), { x: 0, y: 0, w: 4, h: 4 }, 'chambre', 'Chambre').id));
    s.mutate((d) => void setRoomCount(d, levelId, roomId, 'fenetre', 1));
    expect(useApp.getState().validateGeneratedPlan()).toEqual({ ok: false, unplaced: 1 });
    const opId = useApp.getState().dossiers.find((x) => x.id === id)!.plan.levels[0].openings[0].id;
    s.mutate((d) => void placeOpeningAt(d, levelId, opId, { x: 2, y: 0 }));
    expect(useApp.getState().validateGeneratedPlan().ok).toBe(true);
  });

  it('enregistre et recharge les ouvertures à positionner', () => {
    const s = useApp.getState();
    const id = s.createDossier({ clientName: 'Persistance menuiseries' });
    s.openDossier(id);
    const levelId = useApp.getState().activeLevelId!;
    let roomId = '';
    s.mutate((d) => void (roomId = addRoom(findLevel(d, levelId), { x: 0, y: 0, w: 4, h: 4 }, 'sejour').id));
    s.mutate((d) => void setRoomCount(d, levelId, roomId, 'baie', 2));
    expect(useApp.getState().saveNow()).toBe(true);
    const loaded = createLocalRepository(localStorage).load();
    const d = loaded.state.dossiers!.find((x) => x.id === id)!;
    expect(d.plan.levels[0].openings.map((o) => o.host)).toEqual([
      { kind: 'unplaced', roomId },
      { kind: 'unplaced', roomId },
    ]);
  });
});
