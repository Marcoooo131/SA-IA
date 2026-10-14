import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Base SQLite : un enregistrement par code de synchronisation (stocké haché).
 * Le document de progression est conservé tel quel, avec un numéro de révision
 * pour détecter les écritures concurrentes entre appareils.
 */
export interface AccountRow {
  key_hash: string;
  created_at: number;
  revision: number;
  doc: string | null;
  updated_at: number | null;
  ai_date: string | null;
  ai_count: number;
}

export type Store = ReturnType<typeof openStore>;

export function openStore(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS accounts (
      key_hash   TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      revision   INTEGER NOT NULL DEFAULT 0,
      doc        TEXT,
      updated_at INTEGER,
      ai_date    TEXT,
      ai_count   INTEGER NOT NULL DEFAULT 0
    );
  `);
  const insert = db.prepare('INSERT INTO accounts (key_hash, created_at) VALUES (?, ?)');
  const get = db.prepare('SELECT * FROM accounts WHERE key_hash = ?');
  const save = db.prepare('UPDATE accounts SET doc = ?, revision = revision + 1, updated_at = ? WHERE key_hash = ? AND revision = ?');
  const setAi = db.prepare('UPDATE accounts SET ai_date = ?, ai_count = ? WHERE key_hash = ?');

  return {
    create(keyHash: string, now = Date.now()) {
      insert.run(keyHash, now);
    },
    get(keyHash: string): AccountRow | undefined {
      return get.get(keyHash) as AccountRow | undefined;
    },
    /** Écrit le document seulement si personne n'a écrit depuis la révision lue. */
    save(keyHash: string, doc: string, baseRevision: number, now = Date.now()): number | null {
      const res = save.run(doc, now, keyHash, baseRevision);
      return Number(res.changes) === 1 ? baseRevision + 1 : null;
    },
    /** Compte un appel IA ; renvoie false si la limite quotidienne est atteinte. */
    consumeAi(keyHash: string, today: string, limit: number): boolean {
      const row = this.get(keyHash);
      if (!row) return false;
      const count = row.ai_date === today ? row.ai_count : 0;
      if (count >= limit) return false;
      setAi.run(today, count + 1, keyHash);
      return true;
    },
    close() {
      db.close();
    },
  };
}
