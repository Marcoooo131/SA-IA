import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { configProblem, normalizeKey, normalizeSupabaseUrl } from './config';

const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const anonKey = normalizeKey(import.meta.env.VITE_SUPABASE_ANON_KEY);

/** Problème de configuration à afficher à la place de l'application (null si tout va bien) */
export let configError: string | null = configProblem(url, anonKey);

/**
 * Type de lien d'authentification reçu (invitation, réinitialisation…). Lu AVANT que Supabase
 * ne consomme et n'efface le fragment de l'URL.
 */
export const initialAuthLinkType: string | null = (() => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, '') || window.location.search);
  return params.get('type');
})();

export const authLinkError: string | null = (() => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return params.get('error_description');
})();

// Seule la clé publique « anon / publishable » est utilisée dans le navigateur.
// Les droits réels sont imposés par la base (Row Level Security).
function makeClient(clientUrl: string, key: string): SupabaseClient {
  return createClient(clientUrl, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit',
    },
    realtime: { params: { eventsPerSecond: 10 } },
  });
}

let client: SupabaseClient;
try {
  client = makeClient(configError ? 'http://localhost' : url, configError ? 'missing' : anonKey);
} catch (e) {
  // Une valeur refusée par supabase-js ne doit jamais laisser une page vide
  configError = `Connexion à Supabase impossible avec la configuration actuelle : ${(e as Error).message}`;
  client = makeClient('http://localhost', 'missing');
}
export const supabase = client;
export const isConfigured = !configError;

/** URL de retour pour les e-mails d'authentification (page courante, sans fragment) */
export function appBaseUrl(): string {
  return window.location.origin + window.location.pathname;
}
