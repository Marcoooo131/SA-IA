import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = !!url && !!anonKey && /^https?:\/\//.test(url);

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
export const supabase: SupabaseClient = createClient(url ?? 'http://localhost', anonKey ?? 'missing', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
  realtime: { params: { eventsPerSecond: 10 } },
});

/** URL de retour pour les e-mails d'authentification (page courante, sans fragment) */
export function appBaseUrl(): string {
  return window.location.origin + window.location.pathname;
}
