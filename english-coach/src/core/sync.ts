import { ApiError, apiFetch, errorMessage } from './api';
import { mergeStates } from './merge';
import type { AppState } from './state';
import { flush, getMeta, getState, setMeta, setState } from './store';

/**
 * Sauvegarde en ligne : chaque appareil possède un code de synchronisation.
 * Le même code saisi sur un autre appareil y récupère toute la progression.
 */

interface RemoteDoc {
  doc: AppState | null;
  revision: number;
  updatedAt: number | null;
}

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error' | 'offline';
let status: SyncStatus = 'idle';
let inFlight: Promise<void> | null = null;
const statusListeners = new Set<(s: SyncStatus) => void>();

function setStatus(s: SyncStatus) {
  status = s;
  statusListeners.forEach((l) => l(s));
}

export function getSyncStatus() {
  return status;
}

export function onSyncStatus(listener: (s: SyncStatus) => void) {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function formatKey(key: string): string {
  return key.replace(/(.{4})(?=.)/g, '$1-');
}

export function cleanKey(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function register(inviteCode?: string): Promise<string> {
  const res = await apiFetch<{ key: string }>('/sync/register', { method: 'POST', body: JSON.stringify({ inviteCode }) });
  setMeta({ syncKey: res.key, revision: 0 });
  return res.key;
}

/** Crée le compte de sauvegarde de cet appareil si nécessaire, puis synchronise. */
export async function ensureAccount(inviteCode?: string): Promise<string | undefined> {
  const key = getMeta().syncKey;
  if (key) return key;
  try {
    return await register(inviteCode);
  } catch (err) {
    setMeta({ syncError: errorMessage(err) });
    if (err instanceof ApiError && err.kind === 'auth') throw err;
    return undefined;
  }
}

async function runSync(): Promise<void> {
  const key = getMeta().syncKey ?? (await ensureAccount());
  if (!key) {
    setStatus(navigator.onLine === false ? 'offline' : 'error');
    return;
  }
  setStatus('syncing');
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const remote = await apiFetch<RemoteDoc>('/sync/state', { key });
      const merged = mergeStates(getState(), remote.doc);
      try {
        const saved = await apiFetch<{ revision: number }>('/sync/state', {
          method: 'PUT',
          key,
          body: JSON.stringify({ doc: merged, baseRevision: remote.revision }),
        });
        // Les réponses données pendant l'échange ne doivent pas être écrasées : on refusionne.
        setState((current) => mergeStates(current, merged));
        await flush();
        setMeta({ revision: saved.revision, lastSyncAt: Date.now(), syncError: undefined });
        setStatus('ok');
        return;
      } catch (err) {
        if (err instanceof ApiError && err.kind === 'conflict') continue;
        throw err;
      }
    }
    throw new ApiError('server', 'La synchronisation n\'a pas pu aboutir après plusieurs essais.');
  } catch (err) {
    setMeta({ syncError: errorMessage(err) });
    setStatus(err instanceof ApiError && err.kind === 'offline' ? 'offline' : 'error');
  }
}

export function syncNow(): Promise<void> {
  if (!inFlight) inFlight = runSync().finally(() => (inFlight = null));
  return inFlight;
}

/** Rattache cet appareil à une sauvegarde existante (code saisi par l'utilisateur). */
export async function linkWithKey(input: string): Promise<void> {
  const key = cleanKey(input);
  if (key.length < 16) throw new ApiError('auth', 'Le code doit contenir au moins 16 caractères.');
  await apiFetch<RemoteDoc>('/sync/state', { key });
  setMeta({ syncKey: key, revision: 0, syncError: undefined });
  await syncNow();
}

let debounce: ReturnType<typeof setTimeout> | null = null;
/** Synchronisation différée après une modification (regroupe les réponses successives). */
export function scheduleSync(delayMs = 8000) {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), delayMs);
}
