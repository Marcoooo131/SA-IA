import { mergeIfChanged } from '../core/merge';
import type { AppState } from '../core/state';
import { flush, getState, setMeta, setState } from '../core/store';
import { useCapability } from './claude';

/**
 * Mémoire de la version artefact : la progression est enregistrée dans la base de données
 * de l'artefact, dans l'espace privé de l'utilisateur (data/users/<id>/progress).
 * Elle suit le compte Claude : le même lien ouvert sur un autre appareil retrouve tout.
 * Une copie reste sur l'appareil (IndexedDB) pour démarrer instantanément.
 */

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error' | 'offline' | 'local';
let status: SyncStatus = 'idle';
let lastError: string | null = null;
let inFlight: Promise<void> | null = null;
let lastWritten = '';
const listeners = new Set<(s: SyncStatus) => void>();

let docRef: any | null | undefined;

function setStatus(s: SyncStatus, error: string | null = null) {
  status = s;
  lastError = error;
  listeners.forEach((l) => l(s));
}

export function getSyncStatus() {
  return status;
}
export function getSyncError() {
  return lastError;
}
export function onSyncStatus(listener: (s: SyncStatus) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function progressDoc() {
  if (docRef !== undefined) return docRef;
  const [db, user] = await Promise.all([useCapability('db'), useCapability('user')]);
  const id = user ? await user.id().catch(() => null) : null;
  docRef = db && id ? db.doc(`data/users/${id}/progress`) : null;
  return docRef;
}

const MAX_BYTES = 230_000;

/** Version allégée pour la mémoire en ligne (un document est limité à 256 Kio). */
export function compactForCloud(state: AppState): string {
  const threads = Object.values(state.chats)
    .filter((t) => t.messages.length)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const build = (attempts: number, nThreads: number, nMessages: number, dropResolved: boolean) =>
    JSON.stringify({
      ...state,
      attempts: state.attempts.slice(-attempts),
      chats: Object.fromEntries(threads.slice(0, nThreads).map((t) => [t.id, { ...t, messages: t.messages.slice(-nMessages) }])),
      mistakes: dropResolved ? Object.fromEntries(Object.entries(state.mistakes).filter(([, m]) => !m.resolved)) : state.mistakes,
    });
  for (const [a, t, m, d] of [
    [600, 12, 40, false],
    [200, 6, 30, true],
    [50, 3, 20, true],
    [0, 1, 10, true],
  ] as const) {
    const json = build(a, t, m, d);
    if (json.length < MAX_BYTES) return json;
  }
  return build(0, 0, 0, true);
}

async function runSync(): Promise<void> {
  if (navigator.onLine === false) {
    setStatus('offline');
    return;
  }
  const ref = await progressDoc();
  if (!ref) {
    setStatus('local');
    return;
  }
  setStatus('syncing');
  try {
    const snap = await ref.get();
    const raw = snap.exists ? (snap.data() as { json?: string }).json : undefined;
    const remote = raw ? JSON.parse(raw) : null;
    if (remote) setState((current) => mergeIfChanged(current, remote));
    const json = compactForCloud(getState());
    if (json !== lastWritten && (!raw || json !== raw)) {
      await ref.set({ json, savedAt: Date.now(), version: 1 });
    }
    lastWritten = json;
    await flush();
    setMeta({ lastSyncAt: Date.now(), syncError: undefined });
    setStatus('ok');
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const message =
      code === 'quota_exceeded'
        ? 'La mémoire en ligne est pleine. Ta progression reste enregistrée sur cet appareil.'
        : code === 'invalid_argument'
          ? "Ce compte ne peut pas enregistrer dans cet artefact (accès en lecture seule). La progression reste sur cet appareil."
          : "La mémoire en ligne n'a pas répondu. Ta progression est enregistrée sur cet appareil et sera envoyée plus tard.";
    setMeta({ syncError: message });
    setStatus('error', message);
  }
}

export function syncNow(): Promise<void> {
  if (!inFlight) inFlight = runSync().finally(() => (inFlight = null));
  return inFlight;
}

let debounce: ReturnType<typeof setTimeout> | null = null;
export function scheduleSync(delayMs = 6000) {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), delayMs);
}

/** Compatibilité avec l'API de la version PWA (aucun compte à créer ici). */
export async function ensureAccount(): Promise<string | undefined> {
  return undefined;
}
