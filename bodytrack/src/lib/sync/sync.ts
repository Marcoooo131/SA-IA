import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { BaseEntity, CollectionName } from '../types';
import { COLLECTIONS, store, useStore } from '../store/store';
import { idbGet, idbSet } from '../db/idb';
import { PHOTO_BUCKET, supabase } from './supabase';
import { fromRemote, TABLES, toRemote } from './mapping';

/**
 * Synchronisation différée « local d'abord » :
 * - chaque modification est enregistrée localement (IndexedDB) puis mise en file d'attente ;
 * - quand l'utilisateur est connecté et en ligne, la file est envoyée (upsert / suppression douce) ;
 * - les changements distants sont récupérés depuis la dernière synchronisation (colonne
 *   server_updated_at gérée par la base) ; en cas de conflit, la modification la plus récente gagne.
 */
type SyncState = 'local' | 'signedout' | 'syncing' | 'synced' | 'offline' | 'error' | 'demo';

interface SyncStore {
  state: SyncState;
  label: string;
  detail: string;
  session: Session | null;
  set(p: Partial<SyncStore>): void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  state: supabase ? 'signedout' : 'local',
  label: supabase ? 'Non connecté' : 'Local',
  detail: supabase ? 'Connecte-toi pour sauvegarder tes données dans le cloud.' : 'Données enregistrées sur cet appareil.',
  session: null,
  set: (p) => set(p),
}));

export function useSyncStatus() {
  const s = useSyncStore();
  const ws = useStore((x) => x.workspace);
  const pending = useStore((x) => Object.keys(x.outbox).length);
  if (ws === 'demo') return { state: 'demo' as const, label: 'Démo', detail: 'Mode démonstration : rien n\'est synchronisé.' };
  if (s.state === 'synced' && pending) return { ...s, label: `${pending} en attente`, detail: 'Modifications en attente d\'envoi.' };
  return s;
}

const status = (p: Partial<SyncStore>) => useSyncStore.getState().set(p);
const BOUND_KEY = 'local:boundUserId';
const PULL_KEY = 'local:lastPull';
let running: Promise<void> | null = null;
let again = false;

export function currentUserId(): string | null {
  return useSyncStore.getState().session?.user.id ?? null;
}

export function initSync(): () => void {
  if (!supabase) return () => {};
  const sb = supabase;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const soon = (ms = 2500) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), ms);
  };
  void sb.auth.getSession().then(({ data }) => onSession(data.session));
  const { data: sub } = sb.auth.onAuthStateChange((_e, session) => onSession(session));
  const unsubStore = useStore.subscribe((s, prev) => {
    if (s.outbox !== prev.outbox && Object.keys(s.outbox).length) soon();
  });
  const onOnline = () => soon(500);
  window.addEventListener('online', onOnline);
  const iv = setInterval(() => soon(0), 120_000);
  return () => {
    sub.subscription.unsubscribe();
    unsubStore();
    window.removeEventListener('online', onOnline);
    clearInterval(iv);
  };
}

async function onSession(session: Session | null) {
  const prev = useSyncStore.getState().session;
  status({ session });
  if (!session) {
    status({ state: 'signedout', label: 'Non connecté', detail: 'Connecte-toi pour sauvegarder tes données dans le cloud.' });
    return;
  }
  if (prev?.user.id === session.user.id && useSyncStore.getState().state === 'synced') return;
  if (store().workspace === 'demo') return;
  const bound = await idbGet<string>(BOUND_KEY);
  if (bound && bound !== session.user.id) {
    // Données locales d'un autre compte : on repart de zéro pour ce compte
    await store().wipeWorkspace('local');
    await idbSet(PULL_KEY, null);
  } else if (!bound) {
    // Premier lien de ce navigateur avec un compte : toutes les données locales seront envoyées
    store().replaceData(store().data, true);
  }
  await idbSet(BOUND_KEY, session.user.id);
  void syncNow();
}

export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = doSync().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

async function doSync() {
  const sb = supabase;
  const userId = currentUserId();
  if (!sb || !userId || store().workspace !== 'local') return;
  if (!navigator.onLine) {
    status({ state: 'offline', label: 'Hors ligne', detail: 'Les modifications seront envoyées au retour de la connexion.' });
    return;
  }
  status({ state: 'syncing', label: 'Synchronisation…', detail: '' });
  try {
    await push(userId);
    await pull();
    await uploadPendingPhotos(userId);
    status({ state: 'synced', label: 'Synchronisé', detail: `Dernière synchronisation : ${new Date().toLocaleTimeString('fr-FR')}` });
    store().setLastSync(new Date().toISOString());
  } catch (e) {
    const msg = (e as Error).message || String(e);
    status({ state: navigator.onLine ? 'error' : 'offline', label: navigator.onLine ? 'Erreur de synchro' : 'Hors ligne', detail: msg });
  }
}

async function push(userId: string) {
  const sb = supabase!;
  const { outbox, data } = store();
  const keys = Object.keys(outbox);
  if (!keys.length) return;
  const byTable = new Map<CollectionName | 'profile', { upserts: Record<string, unknown>[]; deletes: string[]; keys: string[] }>();
  for (const k of keys) {
    const i = k.indexOf(':');
    const name = k.slice(0, i) as CollectionName | 'profile';
    const id = k.slice(i + 1);
    const entry = byTable.get(name) ?? { upserts: [], deletes: [], keys: [] };
    entry.keys.push(k);
    if (outbox[k] === 'delete') entry.deletes.push(id);
    else {
      const row = name === 'profile' ? (data.profile?.id === id ? data.profile : null) : (data[name] as unknown as BaseEntity[]).find((r) => r.id === id);
      if (row) entry.upserts.push(toRemote(row as unknown as Record<string, unknown>, userId));
    }
    byTable.set(name, entry);
  }
  // Ordre des tables respectant les références (séances avant séries, repas avant aliments…)
  const order: (CollectionName | 'profile')[] = ['profile', ...COLLECTIONS];
  for (const name of order) {
    const e = byTable.get(name);
    if (!e) continue;
    const table = TABLES[name];
    for (let i = 0; i < e.upserts.length; i += 400) {
      // Exercices et aliments personnels : identifiants textuels, uniques par utilisateur
      const onConflict = name === 'exercises' || name === 'foods' ? 'user_id,id' : 'id';
      const { error } = await sb.from(table).upsert(e.upserts.slice(i, i + 400), { onConflict });
      if (error) throw new Error(`${table} : ${error.message}`);
    }
    const now = new Date().toISOString();
    for (let i = 0; i < e.deletes.length; i += 200) {
      const { error } = await sb.from(table).update({ deleted_at: now, updated_at: now }).in('id', e.deletes.slice(i, i + 200));
      if (error) throw new Error(`${table} : ${error.message}`);
    }
    store().clearOutbox(e.keys.filter((k) => store().outbox[k] === outbox[k]));
  }
}

async function pull() {
  const sb = supabase!;
  const since = (await idbGet<string>(PULL_KEY)) ?? '1970-01-01T00:00:00Z';
  let maxSeen = since;
  const changes: { name: CollectionName | 'profile'; rows: (BaseEntity & Record<string, unknown>)[] }[] = [];
  for (const name of ['profile', ...COLLECTIONS] as (CollectionName | 'profile')[]) {
    const table = TABLES[name];
    const rows: (BaseEntity & Record<string, unknown>)[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select('*').gt('server_updated_at', since).order('server_updated_at').range(from, from + 999);
      if (error) throw new Error(`${table} : ${error.message}`);
      for (const r of data ?? []) {
        if (r.server_updated_at > maxSeen) maxSeen = r.server_updated_at;
        rows.push(fromRemote(r) as unknown as BaseEntity & Record<string, unknown>);
      }
      if (!data || data.length < 1000) break;
    }
    if (rows.length) changes.push({ name, rows });
  }
  if (changes.length) store().applyRemote(changes);
  await idbSet(PULL_KEY, maxSeen);
}

/** Envoie dans le stockage privé les photos qui n'y sont pas encore */
async function uploadPendingPhotos(userId: string) {
  const sb = supabase!;
  for (const p of store().data.photos.filter((x) => !x.storagePath)) {
    const blob = await idbGet<Blob>(`local:${p.id}`, 'blobs');
    if (!blob) continue;
    const path = `${userId}/${p.id}.jpg`;
    const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(`Photos : ${error.message}`);
    store().upsert('photos', { ...p, storagePath: path });
  }
}

/** Récupère une photo absente localement (autre appareil) et la met en cache */
export async function fetchRemotePhoto(storagePath: string, photoId: string): Promise<Blob | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(storagePath);
  if (error || !data) return null;
  await idbSet(`local:${photoId}`, data, 'blobs');
  return data;
}

export async function deleteRemotePhoto(storagePath: string) {
  if (!supabase || !currentUserId()) return;
  await supabase.storage.from(PHOTO_BUCKET).remove([storagePath]);
}

export async function signOut() {
  await syncNow().catch(() => {});
  await supabase?.auth.signOut();
}

/** Suppression définitive du compte : photos, lignes (cascade) puis utilisateur */
export async function deleteRemoteAccount(): Promise<void> {
  const sb = supabase;
  const userId = currentUserId();
  if (!sb || !userId) return;
  const { data: files } = await sb.storage.from(PHOTO_BUCKET).list(userId, { limit: 1000 });
  if (files?.length) await sb.storage.from(PHOTO_BUCKET).remove(files.map((f) => `${userId}/${f.name}`));
  const { error } = await sb.rpc('delete_my_account');
  if (error) throw new Error(error.message);
  await sb.auth.signOut();
  await idbSet(BOUND_KEY, null);
  await idbSet(PULL_KEY, null);
}
