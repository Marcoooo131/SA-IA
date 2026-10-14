import { useSyncExternalStore } from 'react';
import { dbGet, dbSet, lsGet, lsSet } from './db';
import { emptyState, hydrate, type AppState } from './state';
import { uid } from './util';

/** Informations propres à cet appareil (jamais fusionnées avec les autres appareils). */
export interface DeviceMeta {
  deviceId: string;
  syncKey?: string;
  revision?: number;
  lastSyncAt?: number;
  syncError?: string;
  /** Dernier écran ouvert, pour reprendre où l'on s'était arrêté. */
  lastRoute?: string;
  installHintDismissed?: boolean;
  /** Horodatage de la dernière écriture, pour choisir la copie la plus récente au démarrage. */
  savedAt?: number;
}

const STATE_KEY = 'state';
const META_KEY = 'meta';

let state: AppState = emptyState();
let meta: DeviceMeta = { deviceId: uid('d_') };
let ready = false;
const listeners = new Set<() => void>();
let saveQueued = false;
let dirty = false;
let writes: Promise<void> = Promise.resolve();

function emit() {
  listeners.forEach((l) => l());
}

export async function loadStore(): Promise<void> {
  const [savedState, savedMeta] = await Promise.all([dbGet<AppState>(STATE_KEY), dbGet<DeviceMeta>(META_KEY)]);
  const backup = lsGet<AppState>(STATE_KEY);
  state = hydrate(backup && (!savedState || backup.updatedAt > savedState.updatedAt) ? backup : savedState);
  // La copie synchrone (localStorage) peut être plus récente si l'application a été fermée en pleine écriture.
  const mirror = lsGet<DeviceMeta>(META_KEY);
  const best = [savedMeta, mirror].filter((m): m is DeviceMeta => Boolean(m?.deviceId)).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0];
  meta = best ?? meta;
  if (!savedMeta) await dbSet(META_KEY, meta, { mirror: true });
  ready = true;
  emit();
}

export function isReady() {
  return ready;
}

export function getState(): AppState {
  return state;
}

export function getMeta(): DeviceMeta {
  return meta;
}

export function setState(update: (s: AppState) => AppState) {
  const next = update(state);
  if (next === state) return;
  state = next;
  dirty = true;
  emit();
  scheduleSave();
}

export function setMeta(update: Partial<DeviceMeta>) {
  meta = { ...meta, ...update, savedAt: Date.now() };
  emit();
  // La clé de synchronisation est aussi copiée dans localStorage : c'est elle qui permet de tout récupérer.
  void dbSet(META_KEY, meta, { mirror: true });
}

/**
 * Chaque modification est écrite tout de suite (les changements d'un même instant sont regroupés) :
 * une application fermée juste après une réponse ne perd rien.
 */
function scheduleSave() {
  if (saveQueued) return;
  saveQueued = true;
  queueMicrotask(() => {
    saveQueued = false;
    void flush();
  });
}

/** Écrit l'état sur l'appareil ; les écritures sont sérialisées pour garder la plus récente en dernier. */
export function flush(): Promise<void> {
  if (dirty) {
    dirty = false;
    const snapshot = state;
    writes = writes.then(() => dbSet(STATE_KEY, snapshot));
  }
  return writes;
}

/**
 * Copie synchrone de secours, écrite quand l'application passe en arrière-plan ou se ferme :
 * le système peut tuer l'application avant la fin d'une écriture IndexedDB.
 */
export function flushSync() {
  lsSet(STATE_KEY, state);
  void flush();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function useMeta(): DeviceMeta {
  return useSyncExternalStore(subscribe, getMeta, getMeta);
}

/** Pour les tests uniquement. */
export function resetStoreForTests(s: AppState = emptyState(), m: DeviceMeta = { deviceId: 'd_test' }) {
  state = s;
  meta = m;
  ready = true;
  dirty = false;
  emit();
}
