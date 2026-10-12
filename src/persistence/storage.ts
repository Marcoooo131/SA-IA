import type { Catalog, Dossier } from '@/domain/types';
import { catalogSchema, dossierSchema } from '@/domain/schemas';
import { DEFAULT_RULES_CONFIG, type RulesConfig } from '@/rules/config';

/**
 * Persistance LOCALE du prototype (navigateur du poste) :
 *  - dossiers, catalogue et règles : localStorage (JSON validé par Zod au chargement) ;
 *  - images de plans importées : IndexedDB (voir assets.ts).
 * Aucune donnée n'est centralisée ni synchronisée entre conseillers.
 * L'interface `Repository` permet de remplacer cette implémentation par une API serveur.
 */

export interface PersistedState {
  dossiers: Dossier[];
  catalog: Catalog;
  catalogHistory: { savedAt: string; reason: string; catalog: Catalog }[];
  rules: RulesConfig;
}

export interface LoadResult {
  state: Partial<PersistedState>;
  errors: string[];
}

export interface Repository {
  load(): LoadResult;
  save(state: PersistedState): { ok: true } | { ok: false; error: string };
  clear(): void;
}

export const STORAGE_KEYS = {
  dossiers: 'movers-audit:v1:dossiers',
  catalog: 'movers-audit:v1:catalog',
  catalogHistory: 'movers-audit:v1:catalog-history',
  rules: 'movers-audit:v1:rules',
  backup: 'movers-audit:v1:backup-corrupted',
} as const;

function readJson(storage: Storage, key: string): unknown {
  const raw = storage.getItem(key);
  if (raw === null) return undefined;
  return JSON.parse(raw);
}

export function createLocalRepository(storage: Storage = window.localStorage): Repository {
  return {
    load() {
      const errors: string[] = [];
      const state: Partial<PersistedState> = {};
      try {
        const raw = readJson(storage, STORAGE_KEYS.dossiers);
        if (raw !== undefined) {
          if (!Array.isArray(raw)) throw new Error('format inattendu');
          const valid: Dossier[] = [];
          raw.forEach((d, i) => {
            const parsed = dossierSchema.safeParse(d);
            if (parsed.success) valid.push(parsed.data as Dossier);
            else {
              errors.push(`Dossier n°${i + 1} illisible : ignoré (copie de sauvegarde conservée).`);
              storage.setItem(`${STORAGE_KEYS.backup}:${Date.now()}:${i}`, JSON.stringify(d));
            }
          });
          state.dossiers = valid;
        }
      } catch (e) {
        errors.push(`Dossiers enregistrés illisibles (${(e as Error).message}). Copie de sauvegarde conservée.`);
        const raw = storage.getItem(STORAGE_KEYS.dossiers);
        if (raw) storage.setItem(`${STORAGE_KEYS.backup}:${Date.now()}`, raw);
      }
      try {
        const raw = readJson(storage, STORAGE_KEYS.catalog);
        if (raw !== undefined) {
          const parsed = catalogSchema.safeParse(raw);
          if (parsed.success) state.catalog = parsed.data as Catalog;
          else errors.push('Catalogue enregistré invalide : catalogue de démonstration rechargé.');
        }
      } catch {
        errors.push('Catalogue enregistré illisible : catalogue de démonstration rechargé.');
      }
      try {
        const raw = readJson(storage, STORAGE_KEYS.catalogHistory);
        if (Array.isArray(raw)) state.catalogHistory = raw as PersistedState['catalogHistory'];
      } catch {
        errors.push('Historique du catalogue illisible : ignoré.');
      }
      try {
        const raw = readJson(storage, STORAGE_KEYS.rules);
        if (raw && typeof raw === 'object') state.rules = mergeRules(raw as Partial<RulesConfig>);
      } catch {
        errors.push('Paramètres des règles illisibles : valeurs par défaut rechargées.');
      }
      return { state, errors };
    },
    save(state) {
      try {
        storage.setItem(STORAGE_KEYS.dossiers, JSON.stringify(state.dossiers));
        storage.setItem(STORAGE_KEYS.catalog, JSON.stringify(state.catalog));
        storage.setItem(STORAGE_KEYS.catalogHistory, JSON.stringify(state.catalogHistory.slice(0, 10)));
        storage.setItem(STORAGE_KEYS.rules, JSON.stringify(state.rules));
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error:
            (e as Error).name === 'QuotaExceededError'
              ? 'Espace de stockage local saturé : supprimez d’anciens dossiers ou devis.'
              : `Enregistrement impossible : ${(e as Error).message}`,
        };
      }
    },
    clear() {
      Object.values(STORAGE_KEYS).forEach((k) => storage.removeItem(k));
    },
  };
}

export function mergeRules(partial: Partial<RulesConfig>): RulesConfig {
  const d = DEFAULT_RULES_CONFIG;
  return {
    centralPerDwelling: partial.centralPerDwelling ?? d.centralPerDwelling,
    keypad: { ...d.keypad, ...(partial.keypad ?? {}) },
    motion: { ...d.motion, ...(partial.motion ?? {}) },
    smoke: { ...d.smoke, ...(partial.smoke ?? {}) },
    shock: { ...d.shock, ...(partial.shock ?? {}) },
  };
}
