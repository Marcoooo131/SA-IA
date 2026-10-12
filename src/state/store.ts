import { create } from 'zustand';
import type {
  Catalog,
  Discount,
  Dossier,
  DossierInfo,
  DossierStatus,
  Pack,
  PlacedDevice,
  Plan,
  Product,
  ProtectionMode,
  QuoteRecord,
} from '@/domain/types';
import { createDefaultCatalog, migrateCatalog } from '@/catalog/defaultCatalog';
import { demoApartmentDossier, demoHouseDossier, emptyDossier } from '@/demo/demoData';
import { DEFAULT_RULES_CONFIG, type RulesConfig } from '@/rules/config';
import { runAudit } from '@/rules/engine';
import { applyProposal } from '@/rules/apply';
import { uid } from '@/lib/id';
import type { HousingAnswers } from '@/domain/types';
import type { GenerationResult } from '@/generator/generate';
import { mergeWithCorrections } from '@/generator/provenance';
import { levelHabitableArea } from '@/plan/geometry';
import { createLocalRepository, type PersistedState, type Repository } from '@/persistence/storage';

export type View = 'dashboard' | 'workspace' | 'catalog';
export type WorkspaceTab = 'logement' | 'questionnaire' | 'plan' | 'vue3d' | 'audit' | 'equipements' | 'devis';

export type Selection =
  | { kind: 'room'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'wall'; id: string }
  | { kind: 'device'; id: string }
  | { kind: 'background' }
  | null;

interface Snapshot {
  plan: Plan;
  devices: PlacedDevice[];
}

interface HistoryState {
  dossierId: string | null;
  past: Snapshot[];
  future: Snapshot[];
}

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'error';
  text: string;
}

export interface AppState {
  dossiers: Dossier[];
  catalog: Catalog;
  catalogHistory: PersistedState['catalogHistory'];
  rules: RulesConfig;

  view: View;
  tab: WorkspaceTab;
  activeDossierId: string | null;
  activeLevelId: string | null;
  selection: Selection;
  armedProductId: string | null;
  history: HistoryState;
  saveState: { lastSavedAt: string | null; error: string | null };
  loadErrors: string[];
  toasts: Toast[];

  // navigation
  setView(view: View): void;
  openDossier(id: string, tab?: WorkspaceTab): void;
  setTab(tab: WorkspaceTab): void;
  setActiveLevel(id: string): void;
  select(sel: Selection): void;
  armProduct(productId: string | null): void;
  toast(kind: Toast['kind'], text: string): void;
  dismissToast(id: string): void;

  // dossiers
  createDossier(info?: Partial<DossierInfo>): string;
  duplicateDossier(id: string): string | null;
  deleteDossier(id: string): void;
  updateInfo(patch: Partial<DossierInfo>): void;
  setStatus(status: DossierStatus, dossierId?: string): void;
  setProtectionMode(mode: ProtectionMode): void;
  validateDemo(): void;

  // plan généré par questionnaire
  saveWizardDraft(templateId: string | null, answers: HousingAnswers | null): void;
  applyGeneration(input: { answers: HousingAnswers; result: GenerationResult; mode: 'remplacer' | 'conserver' }): string[];
  validateGeneratedPlan(): void;

  // plan & équipements (avec historique)
  checkpoint(): void;
  mutate(fn: (draft: Snapshot) => void, opts?: { history?: boolean }): void;
  undo(): void;
  redo(): void;
  applyModeProposal(mode: ProtectionMode): number;
  validateSuggestedDevices(): void;

  // audit
  validateAlert(alertId: string, note?: string): void;
  unvalidateAlert(alertId: string): void;

  // devis
  setQuotePack(packId: string | null): void;
  setAdjustment(productId: string, delta: number): void;
  setPriceOverride(productId: string, patch: { initial?: number | null; monthly?: number | null }): void;
  setMoved(productId: string, quantity: number): void;
  setPackOverride(patch: { initial?: number | null; monthly?: number | null } | null): void;
  setPackTransferred(on: boolean): void;
  setMovingAll(on: boolean, lines: { productId: string; quantity: number }[]): void;
  setTotalOverride(patch: { initial?: number | null; monthly?: number | null; note?: string } | null): void;
  toggleDiscount(discountId: string): void;
  addQuoteRecord(record: QuoteRecord): void;

  // catalogue
  updateProduct(id: string, patch: Partial<Product>): void;
  addProduct(product: Product): void;
  updatePack(id: string, patch: Partial<Pack>): void;
  updateDiscount(id: string, patch: Partial<Discount>): void;
  addDiscount(): void;
  removeDiscount(id: string): void;
  updateSettings(patch: Partial<Catalog['settings']>): void;
  replaceCatalog(next: Catalog, reason: string): void;
  restoreCatalog(index: number): void;
  updateRules(rules: RulesConfig): void;

  // persistance
  saveNow(): boolean;
  resetDemo(): void;
}

const HISTORY_LIMIT = 80;
let repository: Repository | null = null;

export function setRepository(repo: Repository) {
  repository = repo;
}

function getRepo(): Repository | null {
  if (repository) return repository;
  if (typeof window !== 'undefined' && window.localStorage) repository = createLocalRepository(window.localStorage);
  return repository;
}

function nextReference(dossiers: Dossier[]): string {
  const year = new Date().getFullYear();
  let n = dossiers.length + 1;
  const refs = new Set(dossiers.map((d) => d.info.reference));
  while (refs.has(`MOV-${year}-${String(n).padStart(4, '0')}`)) n++;
  return `MOV-${year}-${String(n).padStart(4, '0')}`;
}

function touch(d: Dossier): Dossier {
  return { ...d, updatedAt: new Date().toISOString() };
}

export function initialData(): Pick<AppState, 'dossiers' | 'catalog' | 'catalogHistory' | 'rules' | 'loadErrors'> {
  const repo = getRepo();
  const loaded = repo?.load() ?? { state: {}, errors: [] };
  const migrated = loaded.state.catalog ? migrateCatalog(loaded.state.catalog) : null;
  const catalog = migrated ? migrated.catalog : createDefaultCatalog();
  const dossiers = loaded.state.dossiers ?? [demoHouseDossier(catalog), demoApartmentDossier()];
  return {
    dossiers,
    catalog,
    catalogHistory: loaded.state.catalogHistory ?? [],
    rules: loaded.state.rules ?? DEFAULT_RULES_CONFIG,
    loadErrors: loaded.errors,
  };
}

export const useApp = create<AppState>()((set, get) => {
  const updateActive = (fn: (d: Dossier) => Dossier) => {
    const id = get().activeDossierId;
    if (!id) return;
    set((s) => ({ dossiers: s.dossiers.map((d) => (d.id === id ? touch(fn(d)) : d)) }));
  };
  const active = () => get().dossiers.find((d) => d.id === get().activeDossierId) ?? null;
  const bumpCatalog = (fn: (c: Catalog) => Catalog) =>
    set((s) => ({ catalog: { ...fn(s.catalog), version: s.catalog.version + 1, updatedAt: new Date().toISOString() } }));

  return {
    ...initialData(),
    view: 'dashboard',
    tab: 'logement',
    activeDossierId: null,
    activeLevelId: null,
    selection: null,
    armedProductId: null,
    history: { dossierId: null, past: [], future: [] },
    saveState: { lastSavedAt: null, error: null },
    toasts: [],

    setView: (view) => set({ view, selection: null, armedProductId: null }),
    openDossier: (id, tab = 'logement') => {
      const d = get().dossiers.find((x) => x.id === id);
      if (!d) return;
      const levels = [...d.plan.levels].sort((a, b) => a.index - b.index);
      set({
        view: 'workspace',
        tab,
        activeDossierId: id,
        activeLevelId: levels[0]?.id ?? null,
        selection: null,
        armedProductId: null,
        history: { dossierId: id, past: [], future: [] },
      });
    },
    setTab: (tab) => set({ tab, armedProductId: null }),
    setActiveLevel: (id) => set({ activeLevelId: id, selection: null }),
    select: (selection) => set({ selection }),
    armProduct: (armedProductId) => set({ armedProductId }),
    toast: (kind, text) => {
      const t = { id: uid('toast'), kind, text };
      set((s) => ({ toasts: [...s.toasts.slice(-3), t] }));
      setTimeout(() => get().dismissToast(t.id), kind === 'error' ? 7000 : 3500);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    createDossier: (info) => {
      const id = uid('dos');
      const d = emptyDossier(id, nextReference(get().dossiers));
      d.info = { ...d.info, ...info };
      if (info?.floors && info.floors > 1) {
        for (let i = 1; i < info.floors; i++)
          d.plan.levels.push({
            id: uid('lvl'),
            name: i === 1 ? 'Étage (R+1)' : `Étage (R+${i})`,
            index: i,
            height: 2.5,
            rooms: [],
            walls: [],
            openings: [],
            background: null,
          });
      }
      set((s) => ({ dossiers: [d, ...s.dossiers] }));
      return id;
    },
    duplicateDossier: (id) => {
      const src = get().dossiers.find((d) => d.id === id);
      if (!src) return null;
      const copy: Dossier = structuredClone(src);
      copy.id = uid('dos');
      copy.info.reference = nextReference(get().dossiers);
      copy.info.createdAt = new Date().toISOString();
      copy.status = 'brouillon';
      copy.quotes = [];
      copy.demoValidatedAt = null;
      copy.updatedAt = new Date().toISOString();
      set((s) => ({ dossiers: [copy, ...s.dossiers] }));
      return copy.id;
    },
    deleteDossier: (id) =>
      set((s) => ({
        dossiers: s.dossiers.filter((d) => d.id !== id),
        activeDossierId: s.activeDossierId === id ? null : s.activeDossierId,
        view: s.activeDossierId === id ? 'dashboard' : s.view,
      })),
    updateInfo: (patch) => updateActive((d) => ({ ...d, info: { ...d.info, ...patch } })),
    setStatus: (status, dossierId) => {
      const id = dossierId ?? get().activeDossierId;
      set((s) => ({ dossiers: s.dossiers.map((d) => (d.id === id ? touch({ ...d, status }) : d)) }));
    },
    setProtectionMode: (mode) => updateActive((d) => ({ ...d, protectionMode: mode })),
    saveWizardDraft: (templateId, answers) => updateActive((d) => ({ ...d, wizardDraft: { templateId, answers } })),
    applyGeneration: ({ answers, result, mode }) => {
      const d = active();
      if (!d) return [];
      let notes: string[] = [];
      let levels = structuredClone(result.levels);
      if (mode === 'conserver' && d.generation) {
        const merged = mergeWithCorrections(d.plan.levels, d.generation, result.levels);
        levels = merged.levels;
        notes = merged.notes;
      }
      get().mutate((draft) => {
        draft.plan.levels = levels;
        const ids = new Set(levels.map((l) => l.id));
        const before = draft.devices.length;
        // les suggestions non validées seront recalculées par l'audit sur le nouveau plan
        draft.devices = draft.devices.filter((x) => ids.has(x.levelId) && (x.origin === 'manuel' || x.validated));
        if (draft.devices.length < before) notes.push(`${before - draft.devices.length} suggestion(s) d'équipement non validée(s) retirée(s) : relancez l'audit.`);
      });
      const mainRooms = levels.flatMap((l) => l.rooms).filter((r) => !['couloir', 'palier', 'escalier', 'entree', 'wc', 'cellier', 'garage'].includes(r.type)).length;
      const area = Math.round(levels.reduce((s, l) => s + levelHabitableArea(l), 0));
      updateActive((x) => ({
        ...x,
        generation: {
          templateId: result.template.id,
          answers,
          generatedAt: new Date().toISOString(),
          baseline: structuredClone(result.levels),
          fromAnswers: result.fromAnswers,
          validatedAt: null,
          warnings: [...result.warnings, ...notes],
        },
        wizardDraft: { templateId: result.template.id, answers },
        info: {
          ...x.info,
          housingType: answers.housingType === 'autre' ? 'autre' : answers.housingType,
          floors: levels.length,
          rooms: mainRooms,
          surface: x.info.surface ?? area,
        },
      }));
      set({ activeLevelId: levels[0]?.id ?? null, selection: null });
      return notes;
    },
    validateGeneratedPlan: () =>
      updateActive((d) => (d.generation ? { ...d, generation: { ...d.generation, validatedAt: new Date().toISOString() } } : d)),
    validateDemo: () =>
      updateActive((d) => ({ ...d, status: 'proposition_validee', demoValidatedAt: new Date().toISOString() })),

    checkpoint: () => {
      const d = active();
      if (!d) return;
      set((s) => ({
        history: {
          dossierId: d.id,
          past: [...s.history.past, structuredClone({ plan: d.plan, devices: d.devices })].slice(-HISTORY_LIMIT),
          future: [],
        },
      }));
    },
    mutate: (fn, opts = {}) => {
      const d = active();
      if (!d) return;
      if (opts.history !== false) get().checkpoint();
      const draft: Snapshot = structuredClone({ plan: d.plan, devices: d.devices });
      fn(draft);
      // Les équipements d'un niveau supprimé disparaissent avec lui
      const levelIds = new Set(draft.plan.levels.map((l) => l.id));
      draft.devices = draft.devices.filter((x) => levelIds.has(x.levelId));
      updateActive((x) => ({
        ...x,
        plan: draft.plan,
        devices: draft.devices,
        status: x.status === 'brouillon' ? 'audit_en_cours' : x.status,
      }));
    },
    undo: () => {
      const d = active();
      const h = get().history;
      if (!d || !h.past.length) return;
      const prev = h.past[h.past.length - 1];
      set({
        history: { dossierId: d.id, past: h.past.slice(0, -1), future: [structuredClone({ plan: d.plan, devices: d.devices }), ...h.future] },
      });
      updateActive((x) => ({ ...x, plan: prev.plan, devices: prev.devices }));
      fixSelection();
    },
    redo: () => {
      const d = active();
      const h = get().history;
      if (!d || !h.future.length) return;
      const next = h.future[0];
      set({
        history: { dossierId: d.id, past: [...h.past, structuredClone({ plan: d.plan, devices: d.devices })], future: h.future.slice(1) },
      });
      updateActive((x) => ({ ...x, plan: next.plan, devices: next.devices }));
      fixSelection();
    },
    applyModeProposal: (mode) => {
      const d = active();
      if (!d) return 0;
      const audit = runAudit({ ...d, protectionMode: mode }, get().rules, get().catalog.products);
      const before = d.devices.length;
      get().mutate((draft) => {
        draft.devices = applyProposal(draft.devices, audit.proposals[mode], get().catalog.products);
      });
      updateActive((x) => ({ ...x, protectionMode: mode }));
      return (active()?.devices.length ?? 0) - before;
    },
    validateSuggestedDevices: () =>
      get().mutate((draft) => {
        draft.devices.forEach((x) => {
          if (x.origin === 'suggere') x.validated = true;
        });
      }),

    validateAlert: (alertId, note = '') =>
      updateActive((d) => ({
        ...d,
        auditValidations: { ...d.auditValidations, [alertId]: { validatedAt: new Date().toISOString(), note } },
      })),
    unvalidateAlert: (alertId) =>
      updateActive((d) => {
        const next = { ...d.auditValidations };
        delete next[alertId];
        return { ...d, auditValidations: next };
      }),

    // Le prix modifié d'un forfait ne vaut que pour ce forfait
    setQuotePack: (packId) => updateActive((d) => ({ ...d, quoteDraft: { ...d.quoteDraft, packId, packOverride: null } })),
    setPriceOverride: (productId, patch) =>
      updateActive((d) => {
        const cur = d.quoteDraft.priceOverrides.find((o) => o.productId === productId) ?? { productId };
        const next = { ...cur };
        if ('initial' in patch) {
          if (patch.initial === null || patch.initial === undefined) delete next.initial;
          else next.initial = patch.initial;
        }
        if ('monthly' in patch) {
          if (patch.monthly === null || patch.monthly === undefined) delete next.monthly;
          else next.monthly = patch.monthly;
        }
        const others = d.quoteDraft.priceOverrides.filter((o) => o.productId !== productId);
        const keep = next.initial !== undefined || next.monthly !== undefined;
        return { ...d, quoteDraft: { ...d.quoteDraft, priceOverrides: keep ? [...others, next] : others } };
      }),
    setMoved: (productId, quantity) =>
      updateActive((d) => {
        const others = d.quoteDraft.moved.filter((m) => m.productId !== productId);
        const q = Math.max(0, Math.round(quantity));
        return { ...d, quoteDraft: { ...d.quoteDraft, moved: q ? [...others, { productId, quantity: q }] : others } };
      }),
    setPackOverride: (patch) =>
      updateActive((d) => {
        if (patch === null) return { ...d, quoteDraft: { ...d.quoteDraft, packOverride: null } };
        const next: { initial?: number; monthly?: number } = { ...(d.quoteDraft.packOverride ?? {}) };
        for (const k of ['initial', 'monthly'] as const) {
          if (!(k in patch)) continue;
          const v = patch[k];
          if (v === null || v === undefined) delete next[k];
          else next[k] = v;
        }
        return { ...d, quoteDraft: { ...d.quoteDraft, packOverride: next.initial !== undefined || next.monthly !== undefined ? next : null } };
      }),
    setTotalOverride: (patch) =>
      updateActive((d) => {
        if (patch === null) return { ...d, quoteDraft: { ...d.quoteDraft, totalOverride: null } };
        const next: { initial?: number; monthly?: number; note: string } = { note: '', ...(d.quoteDraft.totalOverride ?? {}) };
        for (const k of ['initial', 'monthly'] as const) {
          if (!(k in patch)) continue;
          const v = patch[k];
          if (v === null || v === undefined) delete next[k];
          else next[k] = v;
        }
        if (patch.note !== undefined) next.note = patch.note;
        const keep = next.initial !== undefined || next.monthly !== undefined || next.note !== '';
        return { ...d, quoteDraft: { ...d.quoteDraft, totalOverride: keep ? next : null } };
      }),
    setPackTransferred: (on) => updateActive((d) => ({ ...d, quoteDraft: { ...d.quoteDraft, packTransferred: on } })),
    setMovingAll: (on, lines) =>
      updateActive((d) => ({
        ...d,
        quoteDraft: {
          ...d.quoteDraft,
          packTransferred: on,
          moved: on ? lines.filter((l) => l.quantity > 0).map((l) => ({ productId: l.productId, quantity: l.quantity })) : [],
        },
      })),
    setAdjustment: (productId, delta) =>
      updateActive((d) => {
        const others = d.quoteDraft.adjustments.filter((a) => a.productId !== productId);
        return { ...d, quoteDraft: { ...d.quoteDraft, adjustments: delta ? [...others, { productId, delta }] : others } };
      }),
    toggleDiscount: (discountId) =>
      updateActive((d) => {
        const has = d.quoteDraft.discountIds.includes(discountId);
        return {
          ...d,
          quoteDraft: {
            ...d.quoteDraft,
            discountIds: has ? d.quoteDraft.discountIds.filter((x) => x !== discountId) : [...d.quoteDraft.discountIds, discountId],
          },
        };
      }),
    addQuoteRecord: (record) => updateActive((d) => ({ ...d, quotes: [record, ...d.quotes], status: 'devis_genere' })),

    updateProduct: (id, patch) =>
      bumpCatalog((c) => ({ ...c, products: c.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
    addProduct: (product) => bumpCatalog((c) => ({ ...c, products: [...c.products, product] })),
    updatePack: (id, patch) => bumpCatalog((c) => ({ ...c, packs: c.packs.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
    updateDiscount: (id, patch) =>
      bumpCatalog((c) => ({ ...c, discounts: c.discounts.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
    addDiscount: () =>
      bumpCatalog((c) => ({
        ...c,
        discounts: [
          ...c.discounts,
          { id: uid('disc'), label: 'Nouvelle remise', target: 'initial_total', kind: 'montant', value: 0, active: false, note: '' },
        ],
      })),
    removeDiscount: (id) => bumpCatalog((c) => ({ ...c, discounts: c.discounts.filter((x) => x.id !== id) })),
    updateSettings: (patch) => bumpCatalog((c) => ({ ...c, settings: { ...c.settings, ...patch } })),
    replaceCatalog: (next, reason) =>
      set((s) => ({
        catalogHistory: [{ savedAt: new Date().toISOString(), reason, catalog: s.catalog }, ...s.catalogHistory].slice(0, 10),
        catalog: { ...next, version: s.catalog.version + 1, updatedAt: new Date().toISOString() },
      })),
    restoreCatalog: (index) => {
      const entry = get().catalogHistory[index];
      if (!entry) return;
      get().replaceCatalog(entry.catalog, `Restauration de la version du ${entry.savedAt}`);
    },
    updateRules: (rules) => set({ rules }),

    saveNow: () => {
      const repo = getRepo();
      if (!repo) return false;
      const s = get();
      const res = repo.save({ dossiers: s.dossiers, catalog: s.catalog, catalogHistory: s.catalogHistory, rules: s.rules });
      if (res.ok) set({ saveState: { lastSavedAt: new Date().toISOString(), error: null } });
      else set({ saveState: { lastSavedAt: s.saveState.lastSavedAt, error: res.error } });
      return res.ok;
    },
    resetDemo: () => {
      const catalog = createDefaultCatalog();
      set({
        catalog,
        catalogHistory: [],
        rules: DEFAULT_RULES_CONFIG,
        dossiers: [demoHouseDossier(catalog), demoApartmentDossier()],
        view: 'dashboard',
        activeDossierId: null,
        selection: null,
        history: { dossierId: null, past: [], future: [] },
      });
    },
  };

  function fixSelection() {
    const sel = get().selection;
    const d = active();
    if (!sel || !d || sel.kind === 'background') return;
    const exists =
      sel.kind === 'device'
        ? d.devices.some((x) => x.id === sel.id)
        : d.plan.levels.some((l) =>
            sel.kind === 'room'
              ? l.rooms.some((r) => r.id === sel.id)
              : sel.kind === 'opening'
                ? l.openings.some((o) => o.id === sel.id)
                : l.walls.some((w) => w.id === sel.id),
          );
    if (!exists) set({ selection: null });
  }
});

/** Enregistrement automatique (anti-rebond) dans le stockage local. */
export function startAutosave(delay = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsub = useApp.subscribe((s, prev) => {
    if (s.dossiers === prev.dossiers && s.catalog === prev.catalog && s.rules === prev.rules && s.catalogHistory === prev.catalogHistory)
      return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => useApp.getState().saveNow(), delay);
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsub();
  };
}

export function useActiveDossier(): Dossier | null {
  return useApp((s) => s.dossiers.find((d) => d.id === s.activeDossierId) ?? null);
}
