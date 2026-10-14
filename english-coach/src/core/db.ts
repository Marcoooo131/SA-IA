/**
 * Stockage durable sur l'appareil : IndexedDB (survit aux redémarrages du téléphone),
 * avec repli sur localStorage si IndexedDB est indisponible (navigation privée de certains navigateurs).
 */

const DB_NAME = 'english-coach';
const STORE = 'kv';
const LS_PREFIX = 'english-coach:';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export function lsGet<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota dépassé ou stockage bloqué : IndexedDB reste la source principale */
  }
}

export async function dbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return lsGet<T>(key);
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? lsGet<T>(key));
      req.onerror = () => resolve(lsGet<T>(key));
    } catch {
      resolve(lsGet<T>(key));
    }
  });
}

export async function dbSet(key: string, value: unknown, opts: { mirror?: boolean } = {}): Promise<void> {
  if (opts.mirror) lsSet(key, value);
  const db = await openDb();
  if (!db) return lsSet(key, value);
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        lsSet(key, value);
        resolve();
      };
    } catch {
      lsSet(key, value);
      resolve();
    }
  });
}

/** Demande au navigateur de ne pas effacer les données en cas de manque d'espace. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Pour les tests uniquement. */
export function resetDbForTests() {
  dbPromise = null;
}
