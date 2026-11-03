import { create } from 'zustand';
import type { AppData, BaseEntity, CollectionName, Collections, Profile } from '../types';
import { idbDelete, idbGet, idbKeys, idbSet } from '../db/idb';
import { nowISO } from '../format';

export type Workspace = 'local' | 'demo';
export type OutboxOp = 'upsert' | 'delete';

export const COLLECTIONS: CollectionName[] = [
  'nutritionGoals',
  'exercises',
  'programs',
  'sessions',
  'workoutExercises',
  'sets',
  'foods',
  'meals',
  'mealItems',
  'weights',
  'measurements',
  'photos',
  'journal',
  'goals',
  'achievements',
  'weeklyReports',
];

export function emptyData(): AppData {
  const c = Object.fromEntries(COLLECTIONS.map((n) => [n, []])) as unknown as Collections;
  return { ...c, profile: null };
}

type Row<K extends CollectionName> = Collections[K][number];

interface StoreState {
  status: 'loading' | 'ready';
  workspace: Workspace;
  data: AppData;
  /** File d'attente de synchronisation : « collection:id » → opération */
  outbox: Record<string, OutboxOp>;
  lastSyncAt: string | null;
  saveError: string | null;
  load(): Promise<void>;
  upsert<K extends CollectionName>(name: K, rows: Row<K> | Row<K>[]): void;
  remove<K extends CollectionName>(name: K, ids: string | string[]): void;
  saveProfile(p: Profile): void;
  /** Applique des changements venus du serveur (sans les remettre dans la file d'attente) */
  applyRemote(changes: { name: CollectionName | 'profile'; rows: (BaseEntity & Record<string, unknown>)[] }[]): void;
  clearOutbox(keys: string[]): void;
  setLastSync(at: string): void;
  switchWorkspace(ws: Workspace, seed?: AppData): Promise<void>;
  wipeWorkspace(ws: Workspace): Promise<void>;
  replaceData(data: AppData, markAllForSync: boolean): void;
  flush(): Promise<void>;
}

const WS_KEY = 'bodytrack:workspace';
const key = (ws: Workspace, k: string) => `${ws}:${k}`;

function readWorkspace(): Workspace {
  try {
    return localStorage.getItem(WS_KEY) === 'demo' ? 'demo' : 'local';
  } catch {
    return 'local';
  }
}

const dirty = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<StoreState>((set, get) => {
  function schedule(...keys: string[]) {
    keys.forEach((k) => dirty.add(k));
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void get().flush(), 250);
  }

  function touch<T extends BaseEntity>(row: T): T {
    return { ...row, updatedAt: nowISO() };
  }

  return {
    status: 'loading',
    workspace: readWorkspace(),
    data: emptyData(),
    outbox: {},
    lastSyncAt: null,
    saveError: null,

    async load() {
      const ws = get().workspace;
      const data = emptyData();
      const results = await Promise.all(COLLECTIONS.map((n) => idbGet<unknown[]>(key(ws, `c:${n}`))));
      COLLECTIONS.forEach((n, i) => {
        (data as unknown as Record<string, unknown[]>)[n] = (results[i] as unknown[]) ?? [];
      });
      data.profile = (await idbGet<Profile>(key(ws, 'profile'))) ?? null;
      const outbox = (await idbGet<Record<string, OutboxOp>>(key(ws, 'outbox'))) ?? {};
      const lastSyncAt = (await idbGet<string>(key(ws, 'lastSyncAt'))) ?? null;
      set({ data, outbox, lastSyncAt, status: 'ready' });
    },

    upsert(name, rows) {
      const list = (Array.isArray(rows) ? rows : [rows]).map((r) => touch(r as BaseEntity));
      if (!list.length) return;
      const ids = new Map(list.map((r) => [r.id, r]));
      set((s) => {
        const cur = s.data[name] as unknown as BaseEntity[];
        const next = cur.map((r) => ids.get(r.id) ?? r);
        const existing = new Set(cur.map((r) => r.id));
        for (const r of list) if (!existing.has(r.id)) next.push(r);
        const outbox = { ...s.outbox };
        for (const r of list) outbox[`${name}:${r.id}`] = 'upsert';
        return { data: { ...s.data, [name]: next }, outbox };
      });
      schedule(`c:${name}`, 'outbox');
    },

    remove(name, ids) {
      const set_ = new Set(Array.isArray(ids) ? ids : [ids]);
      if (!set_.size) return;
      set((s) => {
        const cur = s.data[name] as unknown as BaseEntity[];
        const outbox = { ...s.outbox };
        for (const id of set_) outbox[`${name}:${id}`] = 'delete';
        return { data: { ...s.data, [name]: cur.filter((r) => !set_.has(r.id)) }, outbox };
      });
      schedule(`c:${name}`, 'outbox');
    },

    saveProfile(p) {
      set((s) => ({ data: { ...s.data, profile: touch(p) }, outbox: { ...s.outbox, [`profile:${p.id}`]: 'upsert' } }));
      schedule('profile', 'outbox');
    },

    applyRemote(changes) {
      set((s) => {
        const data = { ...s.data };
        for (const ch of changes) {
          if (ch.name === 'profile') {
            const r = ch.rows[ch.rows.length - 1];
            if (r && !r.deletedAt && (!data.profile || r.updatedAt >= data.profile.updatedAt)) data.profile = r as unknown as Profile;
            continue;
          }
          const cur = new Map((data[ch.name] as unknown as BaseEntity[]).map((r) => [r.id, r]));
          for (const r of ch.rows) {
            const local = cur.get(r.id);
            // Le plus récent l'emporte, sauf modification locale encore en attente d'envoi
            if (s.outbox[`${ch.name}:${r.id}`] && local && local.updatedAt > r.updatedAt) continue;
            if (r.deletedAt) cur.delete(r.id);
            else if (!local || r.updatedAt >= local.updatedAt) cur.set(r.id, r);
          }
          (data as unknown as Record<string, unknown[]>)[ch.name] = [...cur.values()];
        }
        return { data };
      });
      schedule(...COLLECTIONS.map((n) => `c:${n}`), 'profile');
    },

    clearOutbox(keys) {
      set((s) => {
        const outbox = { ...s.outbox };
        keys.forEach((k) => delete outbox[k]);
        return { outbox };
      });
      schedule('outbox');
    },

    setLastSync(at) {
      set({ lastSyncAt: at });
      schedule('lastSyncAt');
    },

    async switchWorkspace(ws, seed) {
      await get().flush();
      try {
        localStorage.setItem(WS_KEY, ws);
      } catch {
        /* ignoré */
      }
      set({ workspace: ws, status: 'loading' });
      if (seed) {
        await Promise.all(COLLECTIONS.map((n) => idbSet(key(ws, `c:${n}`), seed[n])));
        await idbSet(key(ws, 'profile'), seed.profile);
        await idbSet(key(ws, 'outbox'), {});
      }
      await get().load();
    },

    async wipeWorkspace(ws) {
      const keys = (await idbKeys()).filter((k) => k.startsWith(`${ws}:`));
      await Promise.all(keys.map((k) => idbDelete(k)));
      const blobKeys = (await idbKeys('blobs')).filter((k) => k.startsWith(`${ws}:`));
      await Promise.all(blobKeys.map((k) => idbDelete(k, 'blobs')));
      if (get().workspace === ws) set({ data: emptyData(), outbox: {}, lastSyncAt: null });
    },

    replaceData(data, markAllForSync) {
      const outbox: Record<string, OutboxOp> = markAllForSync ? {} : get().outbox;
      if (markAllForSync) {
        for (const n of COLLECTIONS) for (const r of data[n] as unknown as BaseEntity[]) outbox[`${n}:${r.id}`] = 'upsert';
        if (data.profile) outbox[`profile:${data.profile.id}`] = 'upsert';
      }
      set({ data, outbox });
      schedule(...COLLECTIONS.map((n) => `c:${n}`), 'profile', 'outbox');
    },

    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      const keys = [...dirty];
      dirty.clear();
      const s = get();
      const ws = s.workspace;
      try {
        await Promise.all(
          keys.map((k) => {
            if (k.startsWith('c:')) return idbSet(key(ws, k), s.data[k.slice(2) as CollectionName]);
            if (k === 'profile') return idbSet(key(ws, 'profile'), s.data.profile);
            if (k === 'outbox') return idbSet(key(ws, 'outbox'), s.outbox);
            if (k === 'lastSyncAt') return idbSet(key(ws, 'lastSyncAt'), s.lastSyncAt);
            return Promise.resolve();
          }),
        );
        if (s.saveError) set({ saveError: null });
      } catch (e) {
        keys.forEach((k) => dirty.add(k));
        set({ saveError: `Sauvegarde locale impossible : ${(e as Error).message}` });
      }
    },
  };
});

if (typeof window !== 'undefined') {
  const flush = () => void useStore.getState().flush();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

/** Accès direct (hors React) */
export const store = () => useStore.getState();
