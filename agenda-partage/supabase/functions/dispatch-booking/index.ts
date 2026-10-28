// Fonction Edge « dispatch-booking » — l'agent Dispatch Movers réserve un créneau dans l'agenda.
//
// Quand l'agent attribue une tâche CRM à un collaborateur (Worked By), il envoie l'échéance de la
// tâche ici : un rendez-vous est créé (ou mis à jour si la tâche l'a déjà été) au nom de ce collaborateur.
//
// Authentification : en-tête « x-dispatch-token » = jeton généré par l'administrateur dans
// Administration > Paramètres (seule son empreinte SHA-256 est en base). Déploiement : verify_jwt = false.
//
// Corps JSON : { external_ref, title, starts_at, ends_at?, duration_minutes?, responsible_email,
//               client_name?, notes?, link?, category? }
import { createClient } from 'npm:@supabase/supabase-js@2';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // 1. Jeton de l'agent
  const token = req.headers.get('x-dispatch-token') ?? '';
  const { data: stored } = await db.from('integration_tokens').select('token_hash').eq('name', 'dispatch').maybeSingle();
  if (!stored || !/^[0-9a-f]{64}$/.test(token) || (await sha256(token)) !== stored.token_hash) {
    return json({ error: 'Jeton Dispatch invalide : générez-le dans Administration > Paramètres de l\'agenda.' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Requête invalide' }, 400);
  }

  // 2. Validation
  const externalRef = str(body.external_ref, 200);
  const title = str(body.title, 200);
  const email = str(body.responsible_email, 320).toLowerCase();
  const start = new Date(String(body.starts_at ?? ''));
  if (!/^[\w:.\-]{3,200}$/.test(externalRef)) return json({ error: 'external_ref invalide' }, 400);
  if (!title) return json({ error: 'Titre manquant' }, 400);
  if (Number.isNaN(start.getTime())) return json({ error: 'Date de début invalide' }, 400);
  const duration = Math.min(Math.max(Number(body.duration_minutes) || 15, 5), 480);
  let end = body.ends_at ? new Date(String(body.ends_at)) : new Date(start.getTime() + duration * 60_000);
  if (Number.isNaN(end.getTime()) || end <= start) end = new Date(start.getTime() + duration * 60_000);
  const link = str(body.link, 2000);

  // 3. Collaborateur responsable = compte actif de l'agenda ayant cette adresse e-mail
  const { data: responsible } = await db.from('profiles').select('id, is_active, full_name').eq('email', email).maybeSingle();
  if (!responsible) return json({ error: `Aucun compte dans l'agenda pour ${email}` }, 422);
  if (!responsible.is_active) return json({ error: `Le compte agenda de ${email} n'est pas activé` }, 422);

  const { data: admin } = await db.from('profiles').select('id').eq('role', 'admin').maybeSingle();
  const categoryName = str(body.category, 60) || 'Appel';
  const { data: category } = await db.from('categories').select('id').ilike('name', categoryName).maybeSingle();

  const fields = {
    title,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    all_day: false,
    responsible_id: responsible.id,
    client_name: str(body.client_name, 200) || null,
    notes: str(body.notes, 5000) || null,
    links: /^https?:\/\/\S+$/i.test(link) ? [{ label: 'Tâche CRM', url: link }] : [],
    updated_by: admin?.id ?? null,
  };

  // 4. Création, ou mise à jour si cette tâche a déjà été réservée
  const { data: existing } = await db.from('appointments').select('id, status, starts_at, ends_at, responsible_id, title')
    .eq('external_ref', externalRef).maybeSingle();
  if (existing) {
    if (['termine', 'annule'].includes(existing.status)) return json({ ok: true, id: existing.id, action: 'unchanged' });
    const same = Date.parse(existing.starts_at) === start.getTime() && Date.parse(existing.ends_at) === end.getTime()
      && existing.responsible_id === responsible.id && existing.title === title;
    if (same) return json({ ok: true, id: existing.id, action: 'unchanged' });
    const { error } = await db.from('appointments').update(fields).eq('id', existing.id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, id: existing.id, action: 'updated' });
  }
  const { data: created, error } = await db.from('appointments').insert({
    ...fields,
    external_ref: externalRef,
    status: 'confirme',
    category_id: category?.id ?? null,
    created_by: admin?.id ?? null,
  }).select('id').single();
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true, id: created.id, action: 'created' });
});
