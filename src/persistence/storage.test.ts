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
