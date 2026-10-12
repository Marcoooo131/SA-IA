import { describe, expect, it } from 'vitest';
import { demoHouseDossier, emptyDossier } from '@/demo/demoData';
import { createDefaultCatalog } from '@/catalog/defaultCatalog';
import { DEFAULT_RULES_CONFIG } from './config';
import { runAudit, shockQuantity } from './engine';
import { applyProposal, billOfMaterials } from './apply';
import type { Dossier } from '@/domain/types';

const catalog = createDefaultCatalog();
const audit = (d: Dossier) => runAudit(d, DEFAULT_RULES_CONFIG, catalog.products);

describe("moteur de règles d'audit", () => {
  it('recense pièces, ouvertures extérieures et points d’entrée du scénario de démonstration', () => {
    const r = audit(demoHouseDossier(catalog));
    expect(r.inventory.levels).toHaveLength(2);
    expect(r.inventory.exteriorOpenings).toHaveLength(13);
    expect(r.inventory.entryPoints).toBe(3);
  });

  it('propose une centrale et un clavier par logement, et signale les points d’entrée multiples', () => {
    const r = audit(demoHouseDossier(catalog));
    for (const m of ['volumetrique', 'perimetrique'] as const) {
      expect(r.proposals[m].counts.centrale).toBe(1);
      expect(r.proposals[m].counts.clavier).toBe(1);
    }
    const a = r.alerts.find((x) => x.id === 'clavier:points-entree')!;
    expect(a.status).toBe('a_verifier');
    expect(a.reason).toMatch(/Jusqu'à 3 claviers/);
  });

  it('estime les détecteurs de fumée par niveau (50 m² indicatifs) et demande une vérification', () => {
    const r = audit(demoHouseDossier(catalog));
    // RDC : 96 m² hors garage -> 2 ; étage 85,5 m² -> 2
    expect(r.inventory.levels.map((l) => l.smokeEstimate)).toEqual([2, 2]);
    expect(r.proposals.volumetrique.counts.detecteur_fumee).toBe(4);
    expect(r.alerts.filter((a) => a.ruleId === 'R-FUMEE').every((a) => a.status === 'a_verifier')).toBe(true);
  });

  it("propose un détecteur de choc par menuiserie, 2 pour une baie, aucun sur porte sectionnelle", () => {
    const r = audit(demoHouseDossier(catalog));
    const shocks = r.proposals.perimetrique.devices.filter((d) => d.category === 'detecteur_choc');
    expect(shocks.find((s) => s.openingId === 'o_sejour_baie')!.quantity).toBe(2);
    expect(shocks.find((s) => s.openingId === 'o_garage')).toBeUndefined();
    // 13 ouvertures extérieures - 1 sectionnelle + 1 (baie = 2)
    expect(r.proposals.perimetrique.counts.detecteur_choc).toBe(13);
    expect(r.alerts.some((a) => a.id === 'choc:o_garage:sectionnelle')).toBe(true);
    const garage = demoHouseDossier(catalog).plan.levels[0].openings.find((o) => o.id === 'o_garage')!;
    expect(shockQuantity(garage, DEFAULT_RULES_CONFIG)).toBe(0);
    expect(shockQuantity({ ...garage, sectional: false }, DEFAULT_RULES_CONFIG)).toBe(1);
    expect(shockQuantity({ ...garage, sectional: false }, { ...DEFAULT_RULES_CONFIG, shock: { ...DEFAULT_RULES_CONFIG.shock, perOpening: 2 } })).toBe(2);
  });

  it('garantit au minimum un détecteur de mouvement par étage', () => {
    const r = audit(demoHouseDossier(catalog));
    for (const mode of ['volumetrique', 'perimetrique'] as const) {
      const levels = new Set(r.proposals[mode].devices.filter((d) => d.category === 'detecteur_mouvement').map((d) => d.levelId));
      expect(levels.size).toBe(2);
    }
  });

  it('étudie la cuisine ouverte et le garage (points à vérifier)', () => {
    const r = audit(demoHouseDossier(catalog));
    expect(r.alerts.find((a) => a.id === 'mvt:r_sejour:cuisine-ouverte')!.reason).toMatch(/second détecteur/);
    expect(r.alerts.find((a) => a.id === 'mvt:r_garage:garage')).toBeDefined();
  });

  it('signale les limites du mode volumétrique avec animaux', () => {
    const r = audit(demoHouseDossier(catalog));
    expect(r.proposals.volumetrique.limits.join(' ')).toMatch(/animaux/);
    expect(r.alerts.find((a) => a.id === 'mode:animaux')).toBeDefined();
  });

  it('remonte les informations manquantes d’un dossier vide', () => {
    const r = audit(emptyDossier('x', 'MOV-X'));
    const ids = r.alerts.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['dossier:adresse', 'dossier:surface', 'plan:vide', 'dossier:animaux']));
    expect(r.alerts.find((a) => a.id === 'plan:vide')!.status).toBe('manquant');
  });

  it('applique la validation du conseiller sur une alerte', () => {
    const d = demoHouseDossier(catalog);
    d.auditValidations['sirenes'] = { validatedAt: new Date().toISOString(), note: 'Vu avec le client' };
    const a = audit(d).alerts.find((x) => x.id === 'sirenes')!;
    expect(a.status).toBe('valide');
    expect(a.baseStatus).toBe('a_verifier');
    expect(a.validationNote).toBe('Vu avec le client');
  });

  it('détecte les ouvertures en doublon et les pièces qui se chevauchent', () => {
    const d = demoHouseDossier(catalog);
    const rdc = d.plan.levels[0];
    // même porte saisie depuis la pièce voisine (cuisine côté ouest = couloir côté est)
    rdc.openings.push({ ...rdc.openings.find((o) => o.id === 'o_int_cuisine')!, id: 'dup', code: 'RDC-O99', host: { kind: 'room', roomId: 'r_cuisine', side: 'W' } });
    rdc.rooms.push({ id: 'over', name: 'Erreur', type: 'autre', x: 7, y: 4, w: 2, h: 2, openPlan: false });
    const ids = audit(d).alerts.map((a) => a.id);
    expect(ids).toContain('opening:o_int_cuisine:dup:doublon');
    expect(ids.some((i) => i.includes('chevauchement'))).toBe(true);
  });
});

describe('application des propositions sur le plan', () => {
  it('ajoute les suggestions sans doublon et conserve les équipements manuels', () => {
    const d = demoHouseDossier(catalog);
    const r = audit(d);
    const before = d.devices.length;
    const again = applyProposal(d.devices, r.proposals.volumetrique, catalog.products);
    expect(again.length).toBe(before);
    expect(again.some((x) => x.id === 'dev_demo_sirene')).toBe(true);
  });

  it('remplace les suggestions non validées lors du changement de mode', () => {
    const d = demoHouseDossier(catalog);
    const r = audit(d);
    const per = applyProposal(d.devices, r.proposals.perimetrique, catalog.products);
    const bom = billOfMaterials(per);
    expect(bom.get('prd_choc')).toBe(13);
    expect(bom.get('prd_mouvement')).toBe(2);
    expect(bom.get('prd_sirene_int')).toBe(1);
    expect(per.filter((x) => x.origin === 'suggere').every((x) => !x.validated)).toBe(true);
  });

  it('ne pose pas de suggestion sur une ouverture déjà équipée manuellement', () => {
    const d = demoHouseDossier(catalog);
    d.devices = [{ id: 'm', productId: 'prd_choc', levelId: 'lvl_demo_rdc', x: 0, y: 0, rotation: 0, quantity: 1, origin: 'manuel', validated: true, openingId: 'o_porte_entree' }];
    const r = audit(d);
    const res = applyProposal(d.devices, r.proposals.perimetrique, catalog.products);
    expect(res.filter((x) => x.openingId === 'o_porte_entree' && x.productId === 'prd_choc')).toHaveLength(1);
  });
});
