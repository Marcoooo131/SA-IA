/** Traduit les erreurs Supabase / PostgreSQL / réseau en messages compréhensibles */
export function friendlyError(err: unknown): string {
  if (!err) return 'Erreur inconnue';
  const e = err as { message?: string; code?: string; status?: number; name?: string };
  const msg = e.message ?? String(err);

  if (e.name === 'TypeError' && /fetch/i.test(msg)) return 'Connexion impossible. Vérifiez votre accès à Internet.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Connexion impossible. Vérifiez votre accès à Internet.';
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou mot de passe incorrect.';
  if (/Email not confirmed/i.test(msg)) return "Adresse e-mail non confirmée : ouvrez le lien reçu par e-mail.";
  if (/User is banned/i.test(msg)) return 'Ce compte a été désactivé. Contactez un administrateur.';
  if (/rate limit|too many requests/i.test(msg) || e.status === 429) return 'Trop de tentatives. Patientez quelques minutes.';
  if (/Password should be at least/i.test(msg)) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (/JWT expired|invalid JWT/i.test(msg)) return 'Session expirée : reconnectez-vous.';

  if (e.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    if (/administrateur|e-mail|modifiable/i.test(msg)) return msg;
    return "Vous n'avez pas l'autorisation d'effectuer cette action.";
  }
  if (/profiles_single_admin/.test(msg)) return "L'agenda n'a qu'un seul administrateur.";
  if (e.code === '23505') return 'Cet élément existe déjà.';
  if (e.code === '23514') return 'Certaines valeurs sont invalides (vérifiez les dates, la longueur des textes et les liens).';
  if (e.code === '23503') return 'Élément lié introuvable (il a peut-être été supprimé).';
  if (e.code === 'P0001' || e.code === '22023') return msg;
  if (e.code === 'PGRST116') return "Cet élément n'existe plus ou ne vous est pas accessible.";
  return msg;
}
