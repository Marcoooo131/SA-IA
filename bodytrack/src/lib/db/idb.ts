/**
 * Petit wrapper IndexedDB (sans dépendance) : un magasin clé/valeur pour les données JSON
 * et un magasin pour les photos (Blob). Repli en mémoire si IndexedDB est indisponible
 * (navigation privée stricte) : l'application reste utilisable, sans persistance.
 */
const DB_NAME = 'bodytrack';
const DB_VERSION = 1;
const STORES = ['kv', 'blobs'] as const;
type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory: Record<StoreName, Map<string, unknown>> = { kv: new Map(), blobs: new Map() };
export let persistenceAvailable = true;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') throw new Error('IndexedDB indisponible');
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        persistenceAvailable = false;
        resolve(null);
      };
    } catch {
      persistenceAvailable = false;
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        if (!db) throw new Error('no-db');
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function idbGet<T>(key: string, store: StoreName = 'kv'): Promise<T | undefined> {
  const db = await open();
  if (!db) return memory[store].get(key) as T | undefined;
  return tx<T>(store, 'readonly', (s) => s.get(key) as IDBRequest<T>);
}

export async function idbSet(key: string, value: unknown, store: StoreName = 'kv'): Promise<void> {
  const db = await open();
  if (!db) {
    memory[store].set(key, value);
    return;
  }
  await tx(store, 'readwrite', (s) => s.put(value, key));
}

export async function idbDelete(key: string, store: StoreName = 'kv'): Promise<void> {
  const db = await open();
  if (!db) {
    memory[store].delete(key);
    return;
  }
  await tx(store, 'readwrite', (s) => s.delete(key));
}

export async function idbKeys(store: StoreName = 'kv'): Promise<string[]> {
  const db = await open();
  if (!db) return [...memory[store].keys()];
  return tx<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys()).then((k) => k.map(String));
}

/** Demande au navigateur de ne pas effacer les données en cas de manque d'espace */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignoré */
  }
  return false;
}
