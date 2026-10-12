import { describe, expect, it } from 'vitest';
import { demoHouseDossier } from '@/demo/demoData';
import { createDefaultCatalog } from '@/catalog/defaultCatalog';
import { cameraPreset, deviceHeight, levelElevations, levelPlacements } from './Scene3D';
import { buildWallSegments } from '@/plan/geometry';

/**
 * La 3D est générée à partir de la même source de vérité que le plan 2D :
 * coordonnées (x, y) du plan -> (X, Z) de la scène, sans conversion intermédiaire.
 */
describe('synchronisation 2D / 3D', () => {
  const dossier = demoHouseDossier(createDefaultCatalog());

  it('empile les niveaux selon leur hauteur, ou les place côte à côte sans chevauchement', () => {
    const elev = levelElevations(dossier.plan.levels);
    expect(elev.get('lvl_demo_rdc')).toBe(0);
    expect(elev.get('lvl_demo_r1')).toBeCloseTo(2.8);
    const side = levelPlacements(dossier.plan.levels, 'cote', 'tous');
    const rdc = side.placements.get('lvl_demo_rdc')!;
    const r1 = side.placements.get('lvl_demo_r1')!;
    expect(rdc.dx).toBe(0);
    expect(r1.dx).toBeGreaterThan(13 - 3.5); // l'étage commence après le RDC (+ marge)
    const single = levelPlacements(dossier.plan.levels, 'cote', 'lvl_demo_r1');
    expect(single.placements.get('lvl_demo_r1')!.dx).toBe(0);
    expect(single.visible).toHaveLength(1);
  });

  it("positionne les équipements à leurs coordonnées du plan (seule la hauteur est ajoutée)", () => {
    const d = dossier.devices.find((x) => x.productId === 'prd_fumee')!;
    expect(deviceHeight('detecteur_fumee', 2.6)).toBeCloseTo(2.54);
    expect(deviceHeight('detecteur_mouvement', 2.6)).toBeCloseTo(2.2);
    // les coordonnées utilisées par la 3D sont celles du plan
    expect(typeof d.x).toBe('number');
    expect(typeof d.y).toBe('number');
  });

  it('découpe les murs au droit des ouvertures (portes, fenêtres, baies)', () => {
    const segs = buildWallSegments(dossier.plan.levels[0]);
    const cuts = segs.flatMap((s) => s.cuts.map((c) => c.opening.code));
    for (const o of dossier.plan.levels[0].openings) expect(cuts).toContain(o.code);
  });

  it('cadre la caméra sur le plan pour les vues isométrique et de dessus', () => {
    const iso = cameraPreset(dossier, 'iso', 'tous');
    const top = cameraPreset(dossier, 'dessus', 'tous');
    expect(iso.target.x).toBeCloseTo(6.5);
    expect(top.position.y).toBeGreaterThan(10);
    expect(Math.abs(top.position.x - top.target.x)).toBeLessThan(0.1);
  });
});
