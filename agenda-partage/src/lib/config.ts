/**
 * Nettoie les valeurs de connexion saisies dans GitHub / .env : guillemets, espaces, barre finale,
 * chemin /rest/v1 collé par erreur, identifiant de projet seul ou adresse sans https://.
 */
export function normalizeSupabaseUrl(raw: string | undefined): string {
  let v = (raw ?? '').trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!v) return '';
  if (/^[a-z0-9]{15,40}$/.test(v)) return `https://${v}.supabase.co`;
  // Adresse du tableau de bord collée à la place de l'URL du projet
  const dashboard = v.match(/supabase\.com\/dashboard\/project\/([a-z0-9]{15,40})/);
  if (dashboard) return `https://${dashboard[1]}.supabase.co`;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  v = v.replace(/\/(rest|auth)\/v1.*$/i, '').replace(/\/+$/, '');
  return v;
}

export function normalizeKey(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, '');
}

/** Message d'erreur lisible si la configuration est inutilisable, sinon null */
export function configProblem(url: string, key: string): string | null {
  if (!url && !key) return 'Les variables AGENDA_SUPABASE_URL et AGENDA_SUPABASE_ANON_KEY ne sont pas renseignées.';
  if (!url) return 'La variable AGENDA_SUPABASE_URL est vide.';
  if (!key) return 'La variable AGENDA_SUPABASE_ANON_KEY est vide.';
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw new Error();
  } catch {
    return `L'adresse « ${url} » n'est pas une URL valide. Elle doit ressembler à https://abcdefghijklmnop.supabase.co`;
  }
  if (/^(sb_secret_|service_role)/i.test(key)) {
    return 'La clé renseignée est la clé SECRÈTE : remplacez-la par la clé « anon public » ou « publishable ».';
  }
  return null;
}
