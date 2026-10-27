/**
 * Faux serveur Supabase en mémoire, utilisé UNIQUEMENT par les tests d'interface Playwright.
 * Il imite les quelques routes REST / Auth appelées par l'application pour vérifier les écrans
 * (connexion, tableau de bord, agenda, formulaire, fiche) sur ordinateur et sur mobile.
 * Les règles de sécurité réelles sont testées sur PostgreSQL par supabase/tests/security_tests.sql.
 */
import type { Page, Route } from '@playwright/test';

export const MOCK_URL = 'http://mock-supabase.test';

type Row = Record<string, any>;

const ME = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

function iso(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString();
}

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

export function createMockDb() {
  const now = new Date().toISOString();
  const db: Record<string, Row[]> = {
    profiles: [
      { id: ME, email: 'claire@exemple.fr', full_name: 'Claire Admin', role: 'admin', can_edit_all: false, is_active: true, color: '#E30613', phone: null, timezone: null, created_at: now, updated_at: now },
      { id: BOB, email: 'bob@exemple.fr', full_name: 'Bob Martin', role: 'collaborator', can_edit_all: false, is_active: true, color: '#2563EB', phone: null, timezone: null, created_at: now, updated_at: now },
    ],
    categories: [
      { id: 'c1', name: 'Rendez-vous client', color: '#E30613', position: 1, is_active: true },
      { id: 'c2', name: 'Réunion interne', color: '#6B7280', position: 2, is_active: true },
      { id: 'c3', name: 'Intervention', color: '#B8000A', position: 3, is_active: true },
    ],
    app_settings: [
      { id: true, organization_name: 'Équipe Rouge & Noir', timezone: 'Europe/Paris', day_start: '07:00:00', day_end: '20:00:00', default_duration_minutes: 60, collaborators_can_delete: false, updated_at: now },
    ],
    appointments: [
      { id: 'a0000000-0000-4000-8000-000000000001', title: 'Visite technique Dupont', starts_at: iso(1, 10), ends_at: iso(1, 11, 30), all_day: false, client_name: 'M. Dupont', responsible_id: ME, category_id: 'c1', location: '12 rue de la Paix, Paris', description: 'Contrôle de l’installation.', notes: 'Digicode 4521', status: 'confirme', is_private: false, links: [{ label: 'Dossier', url: 'https://exemple.fr/dossier' }], created_by: ME, updated_by: ME, created_at: now, updated_at: now },
      { id: 'a0000000-0000-4000-8000-000000000002', title: 'Réunion d’équipe', starts_at: iso(1, 8), ends_at: iso(1, 9), all_day: false, client_name: null, responsible_id: BOB, category_id: 'c2', location: 'Salle 2', description: null, notes: null, status: 'a_confirmer', is_private: false, links: [], created_by: BOB, updated_by: BOB, created_at: now, updated_at: now },
      { id: 'a0000000-0000-4000-8000-000000000003', title: 'Entretien confidentiel', starts_at: iso(1, 14), ends_at: iso(1, 15), all_day: false, client_name: 'Secret', responsible_id: BOB, category_id: 'c1', location: null, description: null, notes: null, status: 'confirme', is_private: true, links: [], created_by: BOB, updated_by: BOB, created_at: now, updated_at: now },
      { id: 'a0000000-0000-4000-8000-000000000004', title: 'Installation Martin', starts_at: iso(-3, 9), ends_at: iso(-3, 10), all_day: false, client_name: 'Mme Martin', responsible_id: BOB, category_id: 'c3', location: 'Lyon', description: null, notes: null, status: 'reporte', is_private: false, links: [], created_by: BOB, updated_by: BOB, created_at: now, updated_at: now },
    ],
    appointment_comments: [],
    appointment_attachments: [],
    appointment_history: [
      { id: 1, appointment_id: 'a0000000-0000-4000-8000-000000000002', appointment_title: 'Réunion d’équipe', action: 'created', changes: {}, actor_id: BOB, responsible_id: BOB, created_at: now },
    ],
    notifications: [
      { id: 1, user_id: ME, appointment_id: 'a0000000-0000-4000-8000-000000000002', kind: 'assigned', title: 'Bob Martin vous a confié un rendez-vous', body: 'Réunion d’équipe', actor_id: BOB, read_at: null, created_at: now },
    ],
  };
  return db;
}

/** Visibilité « privé » telle qu'appliquée par la base pour l'utilisateur ME (admin ici : tout visible sauf si on teste un collaborateur) */
function visible(a: Row, viewerIsAdmin: boolean): boolean {
  return !a.is_private || viewerIsAdmin || a.created_by === ME || a.responsible_id === ME;
}

function applyQuery(rows: Row[], params: URLSearchParams): Row[] {
  let out = rows;
  for (const [key, value] of params) {
    if (['select', 'order', 'limit', 'offset', 'columns'].includes(key)) continue;
    const [op, ...rest] = value.split('.');
    const arg = rest.join('.');
    if (op === 'eq') out = out.filter((r) => String(r[key]) === arg);
    if (op === 'in') {
      const list = arg.replace(/^\(|\)$/g, '').split(',');
      out = out.filter((r) => list.includes(String(r[key])));
    }
  }
  const order = params.get('order');
  if (order) {
    const [col, dir] = order.split(',')[0]!.split('.');
    out = [...out].sort((a, b) => (String(a[col!]) < String(b[col!]) ? -1 : 1) * (dir === 'desc' ? -1 : 1));
  }
  const limit = params.get('limit');
  if (limit) out = out.slice(0, Number(limit));
  return out;
}

export async function installMockSupabase(page: Page, opts: { viewerIsAdmin?: boolean } = {}) {
  const db = createMockDb();
  const viewerIsAdmin = opts.viewerIsAdmin ?? false;
  if (!viewerIsAdmin) db.profiles[0]!.role = 'collaborator';
  const user = { id: ME, email: 'claire@exemple.fr', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: ME, role: 'authenticated', exp, email: user.email })}.signature`;
  let seq = 100;

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });

  await page.route(`${MOCK_URL}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    }

    // ---------------------------------------------------------------- Auth
    if (path === '/auth/v1/token') {
      const body = req.postDataJSON() as { email?: string; password?: string };
      if (body.password !== 'motdepasse') return json(route, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }, 400);
      return json(route, { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'refresh', user });
    }
    if (path === '/auth/v1/user') return json(route, user);
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 });

    // ---------------------------------------------------------------- RPC
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/').pop();
      const args = (req.postDataJSON() ?? {}) as Record<string, any>;
      if (fn === 'agenda_between') {
        const from = Date.parse(args.p_from);
        const to = Date.parse(args.p_to);
        const rows = db.appointments!
          .filter((a) => Date.parse(a.starts_at) < to && Date.parse(a.ends_at) > from)
          .map((a) => {
            const v = visible(a, viewerIsAdmin);
            const canEdit = v && (viewerIsAdmin || a.created_by === ME || a.responsible_id === ME);
            return v
              ? { ...a, masked: false, can_edit: canEdit, can_delete: viewerIsAdmin }
              : { ...a, title: 'Occupé', client_name: null, location: null, description: null, notes: null, category_id: null, links: [], masked: true, can_edit: false, can_delete: false };
          });
        return json(route, rows);
      }
      if (fn === 'find_conflicts') {
        const rows = db.appointments!
          .filter((a) => a.responsible_id === args.p_responsible_id && !['annule', 'reporte'].includes(a.status) && a.id !== args.p_exclude_id)
          .filter((a) => Date.parse(a.starts_at) < Date.parse(args.p_ends_at) && Date.parse(a.ends_at) > Date.parse(args.p_starts_at))
          .map((a) => ({ id: a.id, title: visible(a, viewerIsAdmin) ? a.title : 'Créneau occupé', starts_at: a.starts_at, ends_at: a.ends_at, masked: !visible(a, viewerIsAdmin) }));
        return json(route, rows);
      }
      if (fn === 'search_appointments') {
        const q = String(args.p_query).toLowerCase();
        return json(route, db.appointments!.filter((a) => visible(a, viewerIsAdmin) && [a.title, a.client_name, a.location].some((s) => s?.toLowerCase().includes(q))));
      }
      return json(route, { message: `RPC inconnue ${fn}` }, 404);
    }

    // ---------------------------------------------------------------- Tables
    const table = path.replace('/rest/v1/', '');
    const rows = db[table];
    if (!rows) return json(route, { message: `Table inconnue ${table}` }, 404);
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const reply = (data: Row[]) => (single ? json(route, data[0] ?? null, data[0] ? 200 : 406) : json(route, data));

    if (method === 'GET' || method === 'HEAD') {
      let list = rows;
      if (table === 'appointments' || table === 'appointment_history') {
        list = rows.filter((r) => table !== 'appointments' || visible(r, viewerIsAdmin));
      }
      return reply(applyQuery(list, url.searchParams));
    }
    if (method === 'POST') {
      const body = req.postDataJSON() as Row | Row[];
      const inserted = (Array.isArray(body) ? body : [body]).map((b) => {
        const row: Row = { id: table === 'appointments' || table === 'appointment_comments' ? crypto.randomUUID() : ++seq, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...b };
        if (table === 'appointments') {
          Object.assign(row, { created_by: ME, updated_by: ME });
          db.appointment_history!.unshift({ id: ++seq, appointment_id: row.id, appointment_title: row.title, action: 'created', changes: {}, actor_id: ME, responsible_id: row.responsible_id, created_at: row.created_at });
        }
        if (table === 'appointment_comments') Object.assign(row, { author_id: ME });
        rows.push(row);
        return row;
      });
      return reply(inserted);
    }
    if (method === 'PATCH') {
      const patch = req.postDataJSON() as Row;
      const targets = applyQuery(rows, url.searchParams);
      for (const t of targets) {
        if (table === 'appointments') {
          const changes: Row = {};
          for (const k of Object.keys(patch)) if (JSON.stringify(t[k]) !== JSON.stringify(patch[k])) changes[k] = { old: t[k], new: patch[k] };
          db.appointment_history!.unshift({ id: ++seq, appointment_id: t.id, appointment_title: patch.title ?? t.title, action: 'updated', changes, actor_id: ME, responsible_id: t.responsible_id, created_at: new Date().toISOString() });
        }
        Object.assign(t, patch, { updated_at: new Date().toISOString() });
      }
      return reply(targets);
    }
    if (method === 'DELETE') {
      const targets = applyQuery(rows, url.searchParams);
      db[table] = rows.filter((r) => !targets.includes(r));
      return reply(targets);
    }
    return json(route, { message: 'Méthode non gérée' }, 405);
  });

  return db;
}
