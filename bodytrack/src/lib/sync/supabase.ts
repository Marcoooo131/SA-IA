import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Client Supabase, créé uniquement si l'adresse et la clé PUBLIQUE sont fournies
 * (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Aucune clé secrète n'est jamais utilisée
 * dans le navigateur : les droits sont imposés par la base (Row Level Security).
 * Sans configuration, l'application fonctionne entièrement en local.
 */
function normalizeUrl(u?: string): string {
  if (!u) return '';
  return u.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
}

const url = normalizeUrl(import.meta.env.VITE_SUPABASE_URL);
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

function looksSecret(k: string) {
  // Une clé « service_role » ou « secret » ne doit jamais être embarquée côté client
  if (k.startsWith('sb_secret_')) return true;
  try {
    const payload = JSON.parse(atob(k.split('.')[1] ?? ''));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

export const configError: string | null = !url || !key ? null : looksSecret(key) ? 'La clé fournie est une clé secrète : elle est refusée. Utilise la clé publique (anon / publishable).' : !/^https?:\/\//.test(url) ? 'Adresse Supabase invalide.' : null;

export const supabase: SupabaseClient | null = url && key && !configError ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

export const isSupabaseConfigured = !!supabase;
export const PHOTO_BUCKET = 'progress-photos';
