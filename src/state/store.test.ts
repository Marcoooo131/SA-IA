import { beforeEach, describe, expect, it } from 'vitest';
import { useApp, setRepository } from './store';
import { createLocalRepository } from '@/persistence/storage';
import { addRoom, findLevel } from '@/plan/actions';
import { billOfMaterials } from '@/rules/apply';
import { quoteForDossier } from '@/quote/compare';

describe('store applicatif', () => {
  beforeEach(() => {
    localStorage.clear();
    setRepository(createLocalRepository(localStorage));
    useApp.getState().resetDemo();
  });

  it('crée un dossier avec ses niveaux et l’ouvre', () => {
    const s = useApp.getState();
    const id = s.createDossier({ clientName: 'Client test', floors: 2, address: '1 rue Test' });
    const d = useApp.getState().dossiers.find((x) => x.id === id)!;
    expect(d.info.reference).toMatch(/^MOV-\d{4}-\d{4}$/);
    expect(d.plan.levels).toHaveLength(2);
    expect(d.status).toBe('brouillon');
    useApp.getState().openDossier(id, 'plan');
    expect(useApp.getState().activeLevelId).toBe(d.plan.levels[0].id);
  });

  it('annule et rétablit les modifications du plan', () => {
    const id = useApp.getState().createDossier({ clientName: 'X' });
    useApp.getState().openDossier(id);
    const levelId = useApp.getState().activeLevelId!;
    useApp.getState().mutate((d) => void addRoom(findLevel(d, levelId), { x: 0, y: 0, w: 4, h: 3 }, 'sejour'));
    useApp.getState().mutate((d) => void addRoom(findLevel(d, levelId), { x: 4, y: 0, w: 3, h: 3 }, 'chambre'));
    const rooms = () => useApp.getState().dossiers.find((x) => x.id === id)!.plan.levels[0].rooms.length;
    expect(rooms()).toBe(2);
    useApp.getState().undo();
    expect(rooms()).toBe(1);
    useApp.getState().undo();
    expect(rooms()).toBe(0);
    useApp.getState().redo();
    expect(rooms()).toBe(1);
    expect(useApp.getState().dossiers.find((x) => x.id === id)!.status).toBe('audit_en_cours');
  });

  it('ajoute et supprime un équipement, avec recalcul du devis', () => {
    const s = useApp.getState();
    s.openDossier('dos_demo_maison');
    const before = quoteForDossier(useApp.getState().dossiers[0], useApp.getState().catalog);
    s.mutate((d) => d.devices.push({ id: 'new', productId: 'prd_sirene_ext', levelId: 'lvl_demo_rdc', x: 1, y: 1, rotation: 0, quantity: 1, origin: 'manuel', validated: true }));
    const mid = quoteForDossier(useApp.getState().dossiers[0], useApp.getState().catalog);
    expect(mid.totals.initial - before.totals.initial).toBe(149);
    expect(mid.totals.monthly - before.totals.monthly).toBeCloseTo(2);
    useApp.getState().mutate((d) => void (d.devices = d.devices.filter((x) => x.id !== 'new')));
    const after = quoteForDossier(useApp.getState().dossiers[0], useApp.getState().catalog);
    expect(after.totals).toEqual(before.totals);
  });

  it('applique une proposition et compare les modes', () => {
    const s = useApp.getState();
    s.openDossier('dos_demo_maison');
    s.applyModeProposal('perimetrique');
    const d = useApp.getState().dossiers.find((x) => x.id === 'dos_demo_maison')!;
    expect(d.protectionMode).toBe('perimetrique');
    expect(billOfMaterials(d.devices).get('prd_choc')).toBe(13);
  });

  it('modifier un tarif recalcule le devis mais pas le devis déjà émis', () => {
    const s = useApp.getState();
    s.openDossier('dos_demo_maison');
    const before = quoteForDossier(useApp.getState().dossiers[0], useApp.getState().catalog);
    s.updateProduct('prd_fumee', { priceInitial: 199 });
    const after = quoteForDossier(useApp.getState().dossiers[0], useApp.getState().catalog);
    // Pack Sérénité : 1 fumée incluse, 3 supplémentaires
    expect(after.totals.initial - before.totals.initial).toBe(150);
    expect(useApp.getState().catalog.version).toBe(2);
  });

  it('archive le catalogue avant remplacement et permet de le restaurer', () => {
    const s = useApp.getState();
    const original = s.catalog;
    s.replaceCatalog({ ...original, products: [] }, 'test');
    expect(useApp.getState().catalog.products).toHaveLength(0);
    expect(useApp.getState().catalogHistory[0].catalog.products.length).toBe(original.products.length);
    useApp.getState().restoreCatalog(0);
    expect(useApp.getState().catalog.products.length).toBe(original.products.length);
  });

  it('enregistre puis recharge les dossiers depuis le stockage local', () => {
    const s = useApp.getState();
    const id = s.createDossier({ clientName: 'Persistance' });
    expect(useApp.getState().saveNow()).toBe(true);
    const loaded = createLocalRepository(localStorage).load();
    expect(loaded.state.dossiers!.some((d) => d.id === id && d.info.clientName === 'Persistance')).toBe(true);
  });

  it('duplique un dossier sans ses devis', () => {
    const s = useApp.getState();
    const copy = s.duplicateDossier('dos_demo_maison')!;
    const d = useApp.getState().dossiers.find((x) => x.id === copy)!;
    expect(d.info.reference).not.toBe('MOV-DEMO-0001');
    expect(d.quotes).toHaveLength(0);
    expect(d.devices.length).toBeGreaterThan(0);
  });
});
