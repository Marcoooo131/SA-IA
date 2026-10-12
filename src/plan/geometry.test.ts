import { describe, expect, it } from 'vitest';
import type { Draft } from './actions';
import { addLevel, addOpeningAt, addRoom, addWall, calibrateBackground, moveOpeningTo, removeLevel, removeRoom, resizeRoom } from './actions';
import { alignRect, buildWallSegments, findDuplicateOpenings, isOpeningExteriorByGeometry, levelArea, nearestHost, openingPlacement, snapValue } from './geometry';
import type { Level } from '@/domain/types';
import { demoHousePlan } from '@/demo/demoData';

function emptyLevel(): Level {
  return { id: 'l0', name: 'RDC', index: 0, height: 2.5, rooms: [], walls: [], openings: [], background: null };
}

describe('dessin du plan', () => {
  it('dessine plusieurs pièces et calcule les surfaces', () => {
    const l = emptyLevel();
    addRoom(l, { x: 0, y: 0, w: 5, h: 4 }, 'sejour');
    addRoom(l, { x: 5, y: 0, w: 3, h: 4 }, 'chambre');
    addRoom(l, { x: 5, y: 4, w: 3, h: 3 }, 'chambre');
    expect(l.rooms.map((r) => r.name)).toEqual(['Séjour', 'Chambre', 'Chambre 2']);
    expect(levelArea(l)).toBe(20 + 12 + 9);
  });

  it('impose une taille minimale et redimensionne par poignée', () => {
    const l = emptyLevel();
    const r = addRoom(l, { x: 0, y: 0, w: 0.1, h: 0.1 }, 'autre');
    expect(r.w).toBe(0.5);
    const start = { ...r, w: 4, h: 3 };
    resizeRoom(r, start, 'se', 1.12, 0.5, (v) => snapValue(v, 0.25));
    expect([r.w, r.h]).toEqual([5, 3.5]);
    resizeRoom(r, start, 'nw', 10, 10, (v) => v);
    expect(r.w).toBe(0.5);
    expect(r.x).toBe(3.5);
  });

  it('génère des murs fusionnés et distingue extérieur / mitoyen', () => {
    const l = emptyLevel();
    addRoom(l, { x: 0, y: 0, w: 4, h: 4 }, 'sejour');
    addRoom(l, { x: 4, y: 0, w: 3, h: 4 }, 'chambre');
    const segs = buildWallSegments(l);
    const shared = segs.find((s) => s.key.startsWith('v:4'))!;
    expect(shared.exterior).toBe(false);
    const north = segs.filter((s) => s.key.startsWith('h:0'));
    expect(north).toHaveLength(1); // fusionné de 0 à 7
    expect(north[0].b.x - north[0].a.x).toBe(7);
    expect(north[0].exterior).toBe(true);
  });

  it('ajoute une ouverture au mur le plus proche et détecte si elle donne sur l’extérieur', () => {
    const levels = demoHousePlan();
    const plan = { levels };
    const rdc = levels[0];
    const ext = addOpeningAt(plan, rdc, 'fenetre', { x: 9, y: 9.05 })!;
    expect(ext.host).toEqual({ kind: 'room', roomId: 'r_sejour', side: 'S' });
    expect(ext.exterior).toBe(true);
    expect(ext.code).toBe('RDC-O14');
    const int = addOpeningAt(plan, rdc, 'porte', { x: 6, y: 1 })!;
    expect(int.exterior).toBe(false);
    expect(addOpeningAt(plan, rdc, 'porte', { x: 50, y: 50 })).toBeNull();
    // identifiants uniques
    const codes = levels.flatMap((l) => l.openings.map((o) => o.code));
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('maintient une ouverture sur son mur lors du déplacement', () => {
    const l = emptyLevel();
    addRoom(l, { x: 0, y: 0, w: 4, h: 3 }, 'sejour');
    const o = addOpeningAt({ levels: [l] }, l, 'porte', { x: 2, y: 3 })!;
    moveOpeningTo(l, o, { x: 100, y: 3 });
    expect(o.offset).toBeCloseTo(4 - o.width / 2);
    const pl = openingPlacement(l, o)!;
    expect(pl.end.x).toBeCloseTo(4);
    expect(isOpeningExteriorByGeometry(l, o)).toBe(true);
  });

  it('suit le redimensionnement de la pièce et découpe les murs en 3D', () => {
    const l = emptyLevel();
    const r = addRoom(l, { x: 0, y: 0, w: 4, h: 3 }, 'sejour');
    addOpeningAt({ levels: [l] }, l, 'baie', { x: 2, y: 3 });
    r.w = 6;
    const south = buildWallSegments(l).find((s) => s.key.startsWith('h:3'))!;
    expect(south.cuts).toHaveLength(1);
    expect(south.cuts[0].t1 - south.cuts[0].t0).toBeCloseTo(2.4);
  });

  it('accepte des murs libres comme support d’ouverture', () => {
    const l = emptyLevel();
    addRoom(l, { x: 0, y: 0, w: 6, h: 4 }, 'sejour');
    const w = addWall(l, { x: 3, y: 0 }, { x: 3, y: 4 });
    const o = addOpeningAt({ levels: [l] }, l, 'porte_interieure', { x: 3.05, y: 2 })!;
    expect(o.host).toEqual({ kind: 'wall', wallId: w.id });
  });

  it('supprime les ouvertures d’une pièce supprimée et les équipements d’un niveau supprimé', () => {
    const levels = demoHousePlan();
    const draft: Draft = { plan: { levels }, devices: [{ id: 'd', productId: 'p', levelId: 'lvl_demo_r1', x: 0, y: 0, rotation: 0, quantity: 1, origin: 'manuel', validated: true }] };
    removeRoom(levels[0], 'r_sejour');
    expect(levels[0].openings.some((o) => o.host.kind === 'room' && o.host.roomId === 'r_sejour')).toBe(false);
    removeLevel(draft, 'lvl_demo_r1');
    expect(draft.devices).toHaveLength(0);
    const l = addLevel(draft.plan);
    expect(l.index).toBe(1);
  });

  it('aligne magnétiquement une pièce sur ses voisines', () => {
    const l = emptyLevel();
    const a = addRoom(l, { x: 0, y: 0, w: 4, h: 4 }, 'sejour');
    const res = alignRect({ x: 4.12, y: 0.08, w: 3, h: 3 }, [a], 0.2);
    expect(res.rect.x).toBe(4);
    expect(res.rect.y).toBe(0);
  });

  it("calibre l'échelle d'un plan importé à partir d'une dimension connue", () => {
    const l = emptyLevel();
    l.background = { assetId: 'a', name: 'plan.png', x: 0, y: 0, width: 10, aspect: 0.5, rotation: 0, opacity: 0.5, visible: true, locked: false, calibrated: false };
    const f = calibrateBackground(l, { x: 1, y: 1 }, { x: 3, y: 1 }, 0.9 * 5);
    expect(f).toBeCloseTo(2.25);
    expect(l.background.width).toBeCloseTo(22.5);
    expect(l.background.x).toBeCloseTo(1 - 2.25);
    expect(l.background.calibrated).toBe(true);
    expect(() => calibrateBackground(l, { x: 1, y: 1 }, { x: 1, y: 1 }, 1)).toThrow();
    expect(() => calibrateBackground(l, { x: 1, y: 1 }, { x: 3, y: 1 }, 0)).toThrow();
  });

  it('trouve le support le plus proche et détecte les doublons', () => {
    const levels = demoHousePlan();
    expect(nearestHost(levels[0], { x: 1, y: -0.1 })).not.toBeNull();
    expect(findDuplicateOpenings(levels[0])).toHaveLength(0);
  });
});
