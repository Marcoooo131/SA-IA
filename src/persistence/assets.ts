/**
 * Stockage des images de plans importées (IndexedDB) : les images peuvent être
 * volumineuses et ne doivent pas saturer le localStorage.
 * Un cache mémoire évite les relectures et sert de repli si IndexedDB est indisponible.
 */

const DB_NAME = 'movers-audit-assets';
const STORE = 'assets';
const memory = new Map<string, string>();

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function putAsset(id: string, dataUrl: string): Promise<void> {
  memory.set(id, dataUrl);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(dataUrl, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getAsset(id: string): Promise<string | undefined> {
  if (memory.has(id)) return memory.get(id);
  const db = await openDb();
  if (!db) return undefined;
  const value = await new Promise<string | undefined>((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as string | undefined);
    req.onerror = () => resolve(undefined);
  });
  db.close();
  if (value) memory.set(id, value);
  return value;
}

export async function deleteAsset(id: string): Promise<void> {
  memory.delete(id);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export function getCachedAsset(id: string): string | undefined {
  return memory.get(id);
}
