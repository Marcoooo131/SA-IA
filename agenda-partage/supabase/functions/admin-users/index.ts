// Fonction Edge Supabase « admin-users » — gestion des comptes par un administrateur.
//
// Pourquoi une fonction serveur ? Créer, inviter ou supprimer un compte exige la clé secrète
// (service_role). Elle n'existe QUE sur les serveurs Supabase (variable SUPABASE_SERVICE_ROLE_KEY
// fournie automatiquement) et n'est jamais envoyée au navigateur.
//
// Déploiement : supabase functions deploy admin-users
// (ou Supabase > Edge Functions > Deploy a new function > coller ce fichier, nom « admin-users »)
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'Configuration serveur incomplète' }, 500);

  // 1. Identifier l'appelant à partir de SON jeton, puis vérifier qu'il est administrateur actif
  const authHeader = req.headers.get('Authorization') ?? '';
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await asCaller.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Non connecté' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: caller } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!caller || caller.role !== 'admin' || !caller.is_active) {
    return json({ error: 'Réservé aux administrateurs' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Requête invalide' }, 400);
  }

  const action = String(body.action ?? '');

  if (action === 'invite') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const fullName = String(body.full_name ?? '').trim().slice(0, 120);
    const role = body.role === 'admin' ? 'admin' : 'collaborator';
    const password = typeof body.password === 'string' ? body.password : '';
    const redirectTo = typeof body.redirect_to === 'string' && /^https?:\/\//.test(body.redirect_to) ? body.redirect_to : undefined;

    if (!EMAIL_RE.test(email)) return json({ error: 'Adresse e-mail invalide' }, 400);
    if (password && password.length < 8) return json({ error: 'Mot de passe provisoire : 8 caractères minimum' }, 400);

    const result = password
      ? await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        })
      : await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: fullName },
          redirectTo,
        });
    if (result.error || !result.data.user) {
      const msg = result.error?.message ?? 'Création impossible';
      const already = /already|registered|exists/i.test(msg);
      return json({ error: already ? 'Un compte existe déjà avec cette adresse' : msg }, already ? 409 : 400);
    }

    const userId = result.data.user.id;
    // Le profil est créé par le déclencheur de la base ; on y applique le rôle choisi par l'admin
    const { error: profileError } = await admin
      .from('profiles')
      .update({ role, full_name: fullName || email.split('@')[0] })
      .eq('id', userId);
    if (profileError) return json({ error: profileError.message }, 500);
    return json({ ok: true, user_id: userId });
  }

  const userId = String(body.user_id ?? '');
  if (!UUID_RE.test(userId)) return json({ error: 'Utilisateur invalide' }, 400);
  if (userId === userData.user.id) return json({ error: 'Action impossible sur votre propre compte' }, 400);

  if (action === 'ban' || action === 'unban') {
    // Désactivation : profil inactif (la base coupe tout accès) + connexion bloquée
    const { error: profileError } = await admin
      .from('profiles')
      .update({ is_active: action === 'unban' })
      .eq('id', userId);
    if (profileError) return json({ error: profileError.message }, 400);
    const { error } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: action === 'ban' ? '876000h' : 'none',
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (action === 'delete') {
    // Vérifie la règle « au moins un admin actif » avant de supprimer
    const { error: guardError } = await admin
      .from('profiles')
      .update({ is_active: false })
      .eq('id', userId);
    if (guardError) return json({ error: guardError.message }, 400);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Action inconnue' }, 400);
});
