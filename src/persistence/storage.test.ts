import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalRepository, STORAGE_KEYS } from './storage';
import { createDefaultCatalog } from '@/catalog/defaultCatalog';
import { demoApartmentDossier, demoHouseDossier } from '@/demo/demoData';
import { DEFAULT_RULES_CONFIG } from '@/rules/config';
import { getAsset, putAsset } from './assets';

describe('persistance locale', () => {
  beforeEach(() => localStorage.clear());

  it('enregistre et recharge un dossier à l’identique', () => {
    const repo = createLocalRepository(localStorage);
    const catalog = createDefaultCatalog();
    const dossiers = [demoHouseDossier(catalog), demoApartmentDossier()];
    dossiers[0].auditValidations['sirenes'] = { validatedAt: '2026-01-01T00:00:00.000Z', note: 'ok' };
    expect(repo.save({ dossiers, catalog, catalogHistory: [], rules: DEFAULT_RULES_CONFIG })).toEqual({ ok: true });
    const loaded = createLocalRepository(localStorage).load();
    expect(loaded.errors).toEqual([]);
    expect(loaded.state.dossiers).toEqual(dossiers);
    expect(loaded.state.catalog).toEqual(catalog);
    expect(loaded.state.rules).toEqual(DEFAULT_RULES_CONFIG);
  });

  it('ignore un dossier corrompu sans perdre les autres et en conserve une copie', () => {
    const catalog = createDefaultCatalog();
    const good = demoHouseDossier(catalog);
    localStorage.setItem(STORAGE_KEYS.dossiers, JSON.stringify([good, { id: 'cassé' }]));
    const loaded = createLocalRepository(localStorage).load();
    expect(loaded.state.dossiers).toHaveLength(1);
    expect(loaded.errors[0]).toMatch(/illisible/);
    expect(Object.keys(localStorage).some((k) => k.startsWith(STORAGE_KEYS.backup))).toBe(true);
  });

  it('gère un JSON invalide et un catalogue invalide', () => {
    localStorage.setItem(STORAGE_KEYS.dossiers, '{pas du json');
    localStorage.setItem(STORAGE_KEYS.catalog, JSON.stringify({ products: 'non' }));
    const loaded = createLocalRepository(localStorage).load();
    expect(loaded.state.dossiers).toBeUndefined();
    expect(loaded.state.catalog).toBeUndefined();
    expect(loaded.errors).toHaveLength(2);
  });

  it('signale un stockage saturé au lieu de planter', () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        const e = new Error('quota');
        e.name = 'QuotaExceededError';
        throw e;
      },
      removeItem: () => undefined,
    } as unknown as Storage;
    const res = createLocalRepository(full).save({ dossiers: [], catalog: createDefaultCatalog(), catalogHistory: [], rules: DEFAULT_RULES_CONFIG });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/saturé/);
  });

  it('complète des paramètres de règles partiels avec les valeurs par défaut', () => {
    localStorage.setItem(STORAGE_KEYS.rules, JSON.stringify({ smoke: { coverageM2: 40 } }));
    const loaded = createLocalRepository(localStorage).load();
    expect(loaded.state.rules!.smoke.coverageM2).toBe(40);
    expect(loaded.state.rules!.motion.rangeM).toBe(10);
  });

  it('stocke les images importées dans IndexedDB', async () => {
    await putAsset('img1', 'data:image/png;base64,AAAA');
    expect(await getAsset('img1')).toBe('data:image/png;base64,AAAA');
  });
});

describe('mise à jour des données existantes', () => {
  it('complète un brouillon de devis enregistré avant l’ajout du déménagement', async () => {
    const { dossierSchema } = await import('@/domain/schemas');
    const d = demoHouseDossier(createDefaultCatalog()) as unknown as Record<string, unknown>;
    const old = structuredClone(d) as { quoteDraft: Record<string, unknown> };
    delete old.quoteDraft.priceOverrides;
    delete old.quoteDraft.moved;
    delete old.quoteDraft.packOverride;
    delete old.quoteDraft.packTransferred;
    const parsed = dossierSchema.parse(old);
    expect(parsed.quoteDraft).toMatchObject({ priceOverrides: [], moved: [], packOverride: null, packTransferred: false });
  });

  it('applique les prix communiqués à un ancien catalogue sans écraser un prix saisi', async () => {
    const { migrateCatalog } = await import('@/catalog/defaultCatalog');
    const cat = createDefaultCatalog();
    cat.products = cat.products.map((p) =>
      p.id === 'prd_centrale' || p.id === 'prd_clavier' ? { ...p, priceInitial: null, monthly: null, billing: 'forfait' as const } : p,
    );
    const res = migrateCatalog(cat);
    expect(res.changed).toBe(true);
    expect(res.catalog.products.find((p) => p.id === 'prd_centrale')).toMatchObject({ priceInitial: 499, monthly: 0, billing: 'unitaire' });
    expect(res.catalog.products.find((p) => p.id === 'prd_clavier')).toMatchObject({ priceInitial: 149, monthly: 0 });
    const custom = createDefaultCatalog();
    custom.products = custom.products.map((p) => (p.id === 'prd_clavier' ? { ...p, priceInitial: 120 } : p));
    expect(migrateCatalog(custom).catalog.products.find((p) => p.id === 'prd_clavier')!.priceInitial).toBe(120);
    // la mensualité de la centrale est toujours ramenée à 0 €
    const old = createDefaultCatalog();
    old.products = old.products.map((p) => (p.id === 'prd_centrale' ? { ...p, monthly: null } : p));
    expect(migrateCatalog(old).catalog.products.find((p) => p.id === 'prd_centrale')!.monthly).toBe(0);
  });
});
