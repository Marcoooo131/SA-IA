// API de démonstration exécutée dans le navigateur (données dans localStorage).
// Elle reproduit les réponses de l'API réelle (backend/venio/modules/*.py) pour que l'interface soit identique.
// Limites assumées : un seul navigateur, aucun email envoyé, aucune donnée partagée entre appareils.
import { ApiError } from "@/lib/api";
import type { Answers, FlowDefinition } from "@/lib/flow";
import { AnswerError, checkDefinition, isAnswered, resolveService, state, summarize, summaryText, validateAnswer, walk } from "./engine";
import { computeSlots, localDate, localTime, plusDays, type Rule } from "./slots";
import data from "./templates.json";

const KEY = "venio-demo-v1";
const HOLD_MIN = 10;
const MIN = 60_000;
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Service = { id: string; key: string; name: string; description: string | null; meeting_type: string; duration_min: number;
  buffer_before_min: number; buffer_after_min: number; slot_interval_min: number; min_notice_min: number; max_horizon_days: number;
  price_display: string | null; is_active: boolean; resource_ids: string[] };
type Booking = { id: string; session_id: string | null; case_file_id: string | null; service_id: string; resource_id: string;
  starts_at: number; ends_at: number; block: [number, number]; status: string; hold_expires_at: number | null;
  location: unknown; token: string; events: { at: number; actor: string; action: string }[] };
type Tenant = {
  id: string; slug: string; name: string; vertical: string; timezone: string; holidays_country: string | null;
  branding: Record<string, unknown>; public_profile: Record<string, unknown>; settings: { postal_prefixes: string[]; cancel_notice_min: number };
  notification_email: string; trial_ends_at: number; owner_id: string;
  resources: { id: string; name: string; is_active: boolean; rules: Rule[] }[];
  services: Service[];
  flow: { name: string; versions: { id: string; version: number; definition: FlowDefinition; published_at: number | null }[]; published_version_id: string };
  sessions: { id: string; token: string; flow_version_id: string; answers: Answers; status: string; source: Record<string, string>; case_file_id: string | null }[];
  bookings: Booking[];
  contacts: { id: string; first_name: string; last_name: string | null; email: string; phone: string | null; address: unknown }[];
  cases: { id: string; contact_id: string; service_id: string; status: string; summary: string; answers: unknown[]; completeness: number;
    source: Record<string, string>; created_at: number; notes: { id: string; body: string; created_at: number; author: string }[];
    consents: { channel: string; purpose: string; granted: boolean }[] }[];
  files: { id: string; session_id: string; case_file_id: string | null; original_name: string; mime_type: string; data_url: string }[];
  notifications: { id: string; booking_id: string; template_key: string; channel: string; to_address: string; status: string;
    provider: string; scheduled_for: number; sent_at: number | null; attempts: number; last_error: string | null }[];
  analytics: { type: string; session_id: string | null; step: string | null; at: number }[];
  time_off: { id: string; resource_id: string | null; starts_at: number; ends_at: number; reason: string | null }[];
};
type DB = { users: { id: string; email: string; full_name: string; password_hash: string }[]; session: { user_id: string; tenant_id: string } | null; tenants: Tenant[] };

const uuid = () => crypto.randomUUID();
const now = () => Date.now();
const isoOf = (ms: number) => new Date(ms).toISOString();
const err = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) => new ApiError(status, code, message, extra);

function load(): DB {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "") as DB; } catch { return { users: [], session: null, tenants: [] }; }
}
function save(db: DB) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {
    throw err(507, "storage_full", "Le stockage de la démonstration est plein (photos). Réinitialisez la démo depuis l'espace entreprise.");
  }
}
export function resetDemo() { localStorage.removeItem(KEY); }

async function sha(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function slugify(name: string) {
  const s = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  return s.length >= 3 ? s : `${s || "entreprise"}-rdv`;
}

// ------------------------------------------------------------------------------------------- création d'un espace
function createTenant(db: DB, owner: { id: string; full_name: string; email: string }, name: string, vertical: string): Tenant {
  const tpl = (data.templates as Record<string, { label: string; services: Record<string, unknown>[]; flow: unknown }>)[vertical] ?? data.templates.generique;
  let slug = slugify(name);
  for (let i = 2; db.tenants.some((t) => t.slug === slug); i++) slug = `${slugify(name)}-${i}`;
  const resource = { id: uuid(), name: owner.full_name, is_active: true,
    rules: (data.default_hours as [number, string, string][]).map(([weekday, start_time, end_time]) => ({ weekday, start_time, end_time })) };
  const services: Service[] = tpl.services.map((s) => ({
    id: uuid(), key: s.key as string, name: s.name as string, description: (s.description as string) ?? null, meeting_type: s.meeting_type as string,
    duration_min: s.duration_min as number, buffer_before_min: (s.buffer_before_min as number) ?? 0, buffer_after_min: (s.buffer_after_min as number) ?? 0,
    slot_interval_min: 30, min_notice_min: (s.min_notice_min as number) ?? 120, max_horizon_days: (s.max_horizon_days as number) ?? 60,
    price_display: null, is_active: true, resource_ids: [resource.id],
  }));
  const v1 = { id: uuid(), version: 1, definition: tpl.flow as FlowDefinition, published_at: now() };
  const t: Tenant = {
    id: uuid(), slug, name, vertical, timezone: "Europe/Paris", holidays_country: "FR",
    branding: { primary_color: "#14213D", accent_color: "#F28C28", logo_url: null },
    public_profile: { tagline: "", description: "", phone: "", email: "", address: "", service_area: "", opening_hours: "", reassurance: [] },
    settings: { postal_prefixes: [], cancel_notice_min: 120 }, notification_email: owner.email,
    trial_ends_at: now() + 14 * 1440 * MIN, owner_id: owner.id, resources: [resource], services,
    flow: { name: `Parcours ${tpl.label.toLowerCase()}`, versions: [v1], published_version_id: v1.id },
    sessions: [], bookings: [], contacts: [], cases: [], files: [], notifications: [], analytics: [], time_off: [],
  };
  db.tenants.push(t);
  return t;
}

// ------------------------------------------------------------------------------------------- utilitaires métier
const svcPublic = (s: Service) => ({ key: s.key, name: s.name, description: s.description, meeting_type: s.meeting_type, duration_min: s.duration_min, price_display: s.price_display });
const defOf = (t: Tenant, versionId: string) => t.flow.versions.find((v) => v.id === versionId)!.definition;
const published = (t: Tenant) => t.flow.versions.find((v) => v.id === t.flow.published_version_id)!;
export const manageUrl = (t: Tenant, b: Booking) => `${location.origin}${BASE_PATH}/rdv/?slug=${encodeURIComponent(t.slug)}&token=${b.token}`;
const blocking = (b: Booking, ignore?: string) =>
  b.id !== ignore && (b.status === "confirmed" || (b.status === "held" && (b.hold_expires_at ?? 0) > now()));

function slotsFor(t: Tenant, s: Service, from: string, to: string, ignoreBooking?: string) {
  const resources = t.resources.filter((r) => r.is_active && s.resource_ids.includes(r.id)).map((r) => ({
    id: r.id, rules: r.rules,
    busy: [
      ...t.bookings.filter((b) => b.resource_id === r.id && blocking(b, ignoreBooking)).map((b) => b.block),
      ...t.time_off.filter((o) => !o.resource_id || o.resource_id === r.id).map((o) => [o.starts_at, o.ends_at] as [number, number]),
    ],
  }));
  return computeSlots(s, resources, from, to, t.timezone, now(), t.holidays_country);
}
function slotsResponse(t: Tenant, s: Service, fromParam: string | null, days: number, ignore?: string) {
  const today = localDate(now(), t.timezone);
  const from = fromParam && fromParam > today ? fromParam : today;
  const to = plusDays(from, Math.min(Math.max(days, 1), 31) - 1);
  const found = slotsFor(t, s, from, to, ignore);
  const grouped = new Map<string, { start: string; time: string }[]>();
  for (const x of found) {
    const d = localDate(x.start, t.timezone);
    grouped.set(d, [...(grouped.get(d) ?? []), { start: isoOf(x.start), time: localTime(x.start, t.timezone) }]);
  }
  return { service: svcPublic(s), from, to, has_more: to < plusDays(today, s.max_horizon_days),
    days: [...grouped.entries()].map(([date, slots]) => ({ date, slots })) };
}
function takeSlot(t: Tenant, s: Service, startIso: string, ignore?: string) {
  const start = Date.parse(startIso);
  const day = localDate(start, t.timezone);
  const slot = slotsFor(t, s, day, day, ignore).find((x) => x.start === start);
  if (!slot) throw err(409, "slot_taken", "Ce créneau n'est plus disponible. Choisissez-en un autre.");
  return { start, end: slot.end, resource_id: slot.resource_ids[0],
    block: [start - s.buffer_before_min * MIN, slot.end + s.buffer_after_min * MIN] as [number, number] };
}
function notify(t: Tenant, b: Booking, key: string, to: string | null | undefined, when = now()) {
  if (!to) return;
  const logged = when <= now();
  t.notifications.push({ id: uuid(), booking_id: b.id, template_key: key, channel: "email", to_address: to,
    status: logged ? "logged" : "scheduled", provider: "démo", scheduled_for: when, sent_at: logged ? when : null, attempts: logged ? 1 : 0, last_error: null });
}
function cancelReminders(t: Tenant, b: Booking) {
  for (const n of t.notifications) if (n.booking_id === b.id && n.status === "scheduled") n.status = "cancelled";
}
function scheduleReminder(t: Tenant, b: Booking, email: string) {
  const when = b.starts_at - 1440 * MIN;
  if (when > now() + 30 * MIN) notify(t, b, "client_reminder", email, when);
}
function contactOf(t: Tenant, b: Booking) {
  const c = t.cases.find((x) => x.id === b.case_file_id);
  return c ? t.contacts.find((x) => x.id === c.contact_id) ?? null : null;
}
function bookingView(t: Tenant, b: Booking, withLink = false) {
  const s = t.services.find((x) => x.id === b.service_id)!;
  const c = contactOf(t, b);
  const view = {
    booking: { id: b.id, starts_at: isoOf(b.starts_at), ends_at: isoOf(b.ends_at), status: b.status, location: b.location,
      service_name: s.name, meeting_type: s.meeting_type, duration_min: s.duration_min, first_name: c?.first_name ?? null },
    tenant: { name: t.name, slug: t.slug, timezone: t.timezone, phone: (t.public_profile.phone as string) || null },
    can_modify: b.status === "confirmed" && now() < b.starts_at - t.settings.cancel_notice_min * MIN,
  };
  return withLink ? { ...view, manage_url: manageUrl(t, b), manage_token: b.token } : view;
}
function row(t: Tenant, b: Booking) {
  const s = t.services.find((x) => x.id === b.service_id)!;
  const c = contactOf(t, b);
  const cf = t.cases.find((x) => x.id === b.case_file_id);
  return { id: b.id, starts_at: isoOf(b.starts_at), ends_at: isoOf(b.ends_at), status: b.status, case_file_id: b.case_file_id,
    resource_id: b.resource_id, resource_name: t.resources.find((r) => r.id === b.resource_id)?.name ?? "", service_name: s.name,
    meeting_type: s.meeting_type, first_name: c?.first_name ?? null, last_name: c?.last_name ?? null, phone: c?.phone ?? null,
    summary: cf?.summary ?? null, location: b.location };
}
async function readImage(file: File): Promise<string> {
  if (file.type === "application/pdf") {
    if (file.size > 300_000) throw err(422, "invalid_file", "Dans la démonstration, les PDF sont limités à 300 Ko.");
    return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(file); });
  }
  const bmp = await createImageBitmap(file).catch(() => { throw err(422, "invalid_file", "Image illisible."); });
  const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7); // ré-encodage : métadonnées (EXIF, GPS) supprimées
}
export function demoFileUrl(id: string): string {
  for (const t of load().tenants) { const f = t.files.find((x) => x.id === id); if (f) return f.data_url; }
  return "";
}

// ------------------------------------------------------------------------------------------- routeur
type Req = { method: string; path: string; query: URLSearchParams; body: unknown; form?: FormData; headers: Record<string, string> };
type Handler = (db: DB, req: Req, m: string[]) => unknown | Promise<unknown>;
const routes: [string, RegExp, Handler][] = [];
const on = (method: string, pattern: string, h: Handler) =>
  routes.push([method, new RegExp(`^${pattern.replace(/:[a-z]+/g, "([^/]+)")}$`), h]);

function auth(db: DB) {
  if (!db.session) throw err(401, "unauthenticated", "Connexion requise.");
  const t = db.tenants.find((x) => x.id === db.session!.tenant_id);
  const u = db.users.find((x) => x.id === db.session!.user_id);
  if (!t || !u) throw err(401, "unauthenticated", "Session expirée, reconnectez-vous.");
  return { t, u };
}
function publicTenant(db: DB, slug: string) {
  const t = db.tenants.find((x) => x.slug === decodeURIComponent(slug));
  if (!t) throw err(404, "not_found", "Cette page n'existe pas (démonstration : créez d'abord votre espace dans ce navigateur).");
  return t;
}
function sessionOf(t: Tenant, id: string, req: Req) {
  const s = t.sessions.find((x) => x.id === id && x.token === req.headers["X-Resume-Token"]);
  if (!s) throw err(404, "not_found", "Demande introuvable.");
  return s;
}
const activeHold = (t: Tenant, sid: string) => t.bookings.find((b) => b.session_id === sid && b.status === "held" && (b.hold_expires_at ?? 0) > now());
const holdView = (b?: Booking) => (b ? { id: b.id, starts_at: isoOf(b.starts_at), ends_at: isoOf(b.ends_at), hold_expires_at: isoOf(b.hold_expires_at!), service_id: b.service_id } : null);
const track = (t: Tenant, type: string, session_id: string | null = null, step: string | null = null) => t.analytics.push({ type, session_id, step, at: now() });
function qualified(t: Tenant, s: Tenant["sessions"][number]) {
  const st = state(defOf(t, s.flow_version_id), s.answers);
  if (!st.qualification_done) throw err(409, "qualification_incomplete", "Merci de répondre d'abord aux questions.");
  const svc = t.services.find((x) => x.key === st.service_key && x.is_active);
  if (!svc) throw err(409, "service_unavailable", "Cette prestation n'est plus proposée en ligne.");
  return svc;
}

// Authentification
on("POST", "/auth/signup", async (db, req) => {
  const b = req.body as { email: string; password: string; full_name: string; company_name: string; vertical: string };
  if ((b.password ?? "").length < 10) throw err(422, "validation", "Le mot de passe doit contenir au moins 10 caractères.");
  if (db.users.some((u) => u.email.toLowerCase() === b.email.toLowerCase())) throw err(409, "email_taken", "Un compte existe déjà avec cet email.");
  const user = { id: uuid(), email: b.email, full_name: b.full_name.trim(), password_hash: await sha(b.password) };
  db.users.push(user);
  const t = createTenant(db, user, b.company_name.trim(), b.vertical);
  db.session = { user_id: user.id, tenant_id: t.id };
  return { user_id: user.id, tenant_id: t.id, slug: t.slug };
});
on("POST", "/auth/login", async (db, req) => {
  const b = req.body as { email: string; password: string };
  const u = db.users.find((x) => x.email.toLowerCase() === b.email.toLowerCase());
  if (!u || u.password_hash !== (await sha(b.password))) throw err(401, "invalid_credentials", "Email ou mot de passe incorrect.");
  const t = db.tenants.find((x) => x.owner_id === u.id);
  if (!t) throw err(403, "no_workspace", "Ce compte n'est rattaché à aucun espace.");
  db.session = { user_id: u.id, tenant_id: t.id };
  return { ok: true };
});
on("POST", "/auth/logout", (db) => { db.session = null; return { ok: true }; });
on("GET", "/auth/me", (db) => {
  const { t, u } = auth(db);
  return { user: { id: u.id, email: u.email, full_name: u.full_name }, role: "owner",
    tenant: { id: t.id, slug: t.slug, name: t.name, vertical: t.vertical, timezone: t.timezone },
    subscription: { status: "trialing", trial_ends_at: isoOf(t.trial_ends_at), plan_name: "Pro", plan_code: "pro" },
    workspaces: [{ id: t.id, name: t.name, slug: t.slug, role: "owner" }],
    public_url: `${location.origin}${BASE_PATH}/r/?slug=${encodeURIComponent(t.slug)}` };
});

// Espace entreprise
on("GET", "/dashboard", (db) => {
  const { t } = auth(db);
  const today = localDate(now(), t.timezone);
  const since = now() - 30 * 1440 * MIN;
  const visible = t.bookings.filter((b) => !["held", "expired"].includes(b.status));
  const count = (type: string) => t.analytics.filter((a) => a.type === type && a.at >= since).length;
  const starts = count("flow_start"), bookings = count("booking");
  const past = visible.filter((b) => ["completed", "no_show"].includes(b.status) && b.starts_at >= since);
  const noShow = past.filter((b) => b.status === "no_show").length;
  return {
    today: visible.filter((b) => ["confirmed", "completed", "no_show"].includes(b.status) && localDate(b.starts_at, t.timezone) === today)
      .sort((a, b) => a.starts_at - b.starts_at).map((b) => row(t, b)),
    upcoming: visible.filter((b) => b.status === "confirmed" && localDate(b.starts_at, t.timezone) > today)
      .sort((a, b) => a.starts_at - b.starts_at).slice(0, 10).map((b) => row(t, b)),
    new_cases: t.cases.filter((c) => c.status === "new").sort((a, b) => b.created_at - a.created_at).slice(0, 10).map((c) => {
      const ct = t.contacts.find((x) => x.id === c.contact_id)!;
      return { id: c.id, created_at: isoOf(c.created_at), summary: c.summary, completeness: c.completeness, first_name: ct.first_name,
        last_name: ct.last_name, service_name: t.services.find((s) => s.id === c.service_id)?.name ?? "" };
    }),
    counts: { visits: count("page_view"), starts, bookings, cancelled: visible.filter((b) => b.status === "cancelled").length,
      no_show: noShow, past: past.length, new_requests: t.cases.filter((c) => c.status === "new").length,
      pending: t.cases.filter((c) => ["to_process", "waiting", "to_recontact"].includes(c.status)).length },
    rates_30d: { conversion: starts ? bookings / starts : null, abandon: starts ? 1 - bookings / starts : null,
      no_show: past.length ? noShow / past.length : null, sample_size: starts, reliable: starts >= 30 },
  };
});
on("GET", "/funnel", (db) => {
  const { t } = auth(db);
  const sessions = (type: string, step?: string) => new Set(t.analytics.filter((a) => a.type === type && a.session_id && (!step || a.step === step)).map((a) => a.session_id)).size;
  const totals = { starts: sessions("flow_start"), slots: sessions("slots_view"), bookings: sessions("booking") };
  return { days: 30, totals, reliable: totals.starts >= 30, note: "Les taux sont indicatifs tant que le volume reste faible ; une corrélation n'est pas une cause.",
    steps: published(t).definition.steps.map((s) => {
      const viewed = sessions("step_view", s.id), answered = sessions("step_answer", s.id);
      return { step: s.id, title: s.title, viewed, answered, drop_rate: viewed ? 1 - answered / viewed : null };
    }) };
});
on("GET", "/bookings", (db, req) => {
  const { t } = auth(db);
  const from = req.query.get("from")!, to = req.query.get("to")!;
  return t.bookings.filter((b) => !["held", "expired"].includes(b.status))
    .filter((b) => { const d = localDate(b.starts_at, t.timezone); return d >= from && d <= to; })
    .sort((a, b) => a.starts_at - b.starts_at).map((b) => row(t, b));
});
on("PATCH", "/bookings/:id", (db, req, [id]) => {
  const { t, u } = auth(db);
  const b = t.bookings.find((x) => x.id === id && !["held", "expired"].includes(x.status));
  if (!b) throw err(404, "not_found", "Rendez-vous introuvable.");
  const body = req.body as { status?: string; start?: string };
  const c = contactOf(t, b);
  if (body.start) {
    const s = t.services.find((x) => x.id === b.service_id)!;
    const slot = takeSlot(t, s, body.start, b.id);
    Object.assign(b, { starts_at: slot.start, ends_at: slot.end, block: slot.block, resource_id: slot.resource_id });
    b.events.push({ at: now(), actor: `user:${u.id}`, action: "rescheduled" });
    cancelReminders(t, b);
    if (c) { notify(t, b, "client_rescheduled", c.email); scheduleReminder(t, b, c.email); }
  }
  if (body.status && body.status !== b.status) {
    b.status = body.status;
    b.events.push({ at: now(), actor: `user:${u.id}`, action: body.status });
    const cf = t.cases.find((x) => x.id === b.case_file_id);
    if (cf) cf.status = ({ cancelled: "cancelled", completed: "done", no_show: "no_show" } as Record<string, string>)[body.status] ?? cf.status;
    if (body.status === "cancelled") { cancelReminders(t, b); if (c) notify(t, b, "client_cancellation", c.email); }
  }
  return { id: b.id, starts_at: isoOf(b.starts_at), ends_at: isoOf(b.ends_at), status: b.status };
});
on("GET", "/case-files", (db, req) => {
  const { t } = auth(db);
  const status = req.query.get("status"), q = (req.query.get("q") ?? "").toLowerCase();
  return t.cases.filter((c) => !status || c.status === status).map((c) => {
    const ct = t.contacts.find((x) => x.id === c.contact_id)!;
    const next = t.bookings.filter((b) => b.case_file_id === c.id && b.status === "confirmed").map((b) => b.starts_at).sort()[0];
    return { id: c.id, created_at: isoOf(c.created_at), status: c.status, summary: c.summary, completeness: c.completeness,
      first_name: ct.first_name, last_name: ct.last_name, email: ct.email, phone: ct.phone,
      service_name: t.services.find((s) => s.id === c.service_id)?.name ?? "", next_booking: next ? isoOf(next) : null };
  }).filter((r) => !q || [r.first_name, r.last_name, r.email, r.phone, r.summary].some((v) => (v ?? "").toLowerCase().includes(q)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
});
on("GET", "/case-files/:id", (db, _req, [id]) => {
  const { t } = auth(db);
  const c = t.cases.find((x) => x.id === id);
  if (!c) throw err(404, "not_found", "Dossier introuvable.");
  const s = t.services.find((x) => x.id === c.service_id);
  const bookings = t.bookings.filter((b) => b.case_file_id === c.id);
  return {
    case: { id: c.id, status: c.status, summary: c.summary, completeness: c.completeness, created_at: isoOf(c.created_at),
      service_name: s?.name ?? "", meeting_type: s?.meeting_type ?? "", source: c.source, answers: c.answers },
    contact: t.contacts.find((x) => x.id === c.contact_id),
    bookings: bookings.map((b) => ({ id: b.id, starts_at: isoOf(b.starts_at), status: b.status, resource_name: t.resources.find((r) => r.id === b.resource_id)?.name })),
    notes: [...c.notes].reverse().map((n) => ({ ...n, created_at: isoOf(n.created_at) })),
    files: t.files.filter((f) => f.case_file_id === c.id).map((f) => ({ id: f.id, original_name: f.original_name, mime_type: f.mime_type })),
    history: bookings.flatMap((b) => b.events).sort((a, b) => a.at - b.at).map((e) => ({ created_at: isoOf(e.at), actor: e.actor, action: e.action })),
    notifications: t.notifications.filter((n) => bookings.some((b) => b.id === n.booking_id)).sort((a, b) => a.scheduled_for - b.scheduled_for)
      .map((n) => ({ ...n, scheduled_for: isoOf(n.scheduled_for) })),
    consents: c.consents,
  };
});
on("PATCH", "/case-files/:id", (db, req, [id]) => {
  const { t } = auth(db);
  const c = t.cases.find((x) => x.id === id);
  if (!c) throw err(404, "not_found", "Dossier introuvable.");
  c.status = (req.body as { status: string }).status;
  return { id: c.id, status: c.status };
});
on("POST", "/case-files/:id/notes", (db, req, [id]) => {
  const { t, u } = auth(db);
  const c = t.cases.find((x) => x.id === id);
  if (!c) throw err(404, "not_found", "Dossier introuvable.");
  const n = { id: uuid(), body: String((req.body as { body: string }).body).trim(), created_at: now(), author: u.full_name };
  if (!n.body) throw err(422, "validation", "La note est vide.");
  c.notes.push(n);
  return { id: n.id, created_at: isoOf(n.created_at) };
});
on("GET", "/notifications", (db) => {
  const { t } = auth(db);
  return [...t.notifications].sort((a, b) => b.scheduled_for - a.scheduled_for).map((n) => ({ ...n, scheduled_for: isoOf(n.scheduled_for), sent_at: n.sent_at ? isoOf(n.sent_at) : null }));
});

// Paramètres
on("GET", "/settings/profile", (db) => {
  const { t } = auth(db);
  return { name: t.name, slug: t.slug, vertical: t.vertical, notification_email: t.notification_email, timezone: t.timezone,
    holidays_country: t.holidays_country, branding: t.branding, public_profile: t.public_profile, settings: t.settings };
});
on("PUT", "/settings/profile", (db, req) => {
  const { t } = auth(db);
  const b = req.body as Tenant & { name: string };
  if (!b.name || b.name.trim().length < 2) throw err(422, "validation", "Le nom est trop court.");
  Object.assign(t, { name: b.name.trim(), notification_email: b.notification_email, timezone: b.timezone, holidays_country: b.holidays_country,
    branding: b.branding, public_profile: b.public_profile, settings: b.settings });
  return { ok: true };
});
on("GET", "/settings/services", (db) => auth(db).t.services);
on("PUT", "/settings/services/:id", (db, req, [id]) => {
  const { t } = auth(db);
  const s = t.services.find((x) => x.id === id);
  if (!s) throw err(404, "not_found", "Prestation introuvable.");
  const b = req.body as Service;
  if (b.duration_min < 5 || b.duration_min > 600) throw err(422, "validation", "Durée entre 5 et 600 minutes.");
  Object.assign(s, { ...b, id: s.id, key: s.key });
  return { ok: true };
});
on("GET", "/settings/resources", (db) => auth(db).t.resources.map((r) => ({ ...r, user_id: null })));
on("PUT", "/settings/resources/:id/availability", (db, req, [id]) => {
  const { t } = auth(db);
  const r = t.resources.find((x) => x.id === id);
  if (!r) throw err(404, "not_found", "Collaborateur introuvable.");
  const rules = (req.body as { rules: Rule[] }).rules;
  for (const x of rules) if (x.end_time <= x.start_time) throw err(422, "validation", "L'heure de fin doit suivre l'heure de début.");
  for (let d = 1; d <= 7; d++) {
    const day = rules.filter((x) => x.weekday === d).sort((a, b) => a.start_time.localeCompare(b.start_time));
    for (let i = 1; i < day.length; i++) if (day[i].start_time < day[i - 1].end_time) throw err(422, "validation", "Plages horaires qui se chevauchent.");
  }
  r.rules = rules;
  return { ok: true };
});
on("GET", "/settings/time-off", (db) => auth(db).t.time_off.filter((o) => o.ends_at > now()).sort((a, b) => a.starts_at - b.starts_at)
  .map((o) => ({ ...o, starts_at: isoOf(o.starts_at), ends_at: isoOf(o.ends_at) })));
on("POST", "/settings/time-off", (db, req) => {
  const { t } = auth(db);
  const b = req.body as { resource_id: string | null; starts_at: string; ends_at: string; reason: string | null };
  const o = { id: uuid(), resource_id: b.resource_id ?? null, starts_at: Date.parse(b.starts_at), ends_at: Date.parse(b.ends_at), reason: b.reason };
  if (!(o.ends_at > o.starts_at)) throw err(422, "validation", "La fin doit suivre le début.");
  t.time_off.push(o);
  return { id: o.id };
});
on("DELETE", "/settings/time-off/:id", (db, _req, [id]) => { const { t } = auth(db); t.time_off = t.time_off.filter((o) => o.id !== id); });
on("GET", "/settings/flow", (db) => {
  const { t } = auth(db);
  const pub = published(t);
  const draft = t.flow.versions.find((v) => v.published_at === null);
  return { name: t.flow.name, published: { ...pub, published_at: isoOf(pub.published_at!) }, draft: draft ?? null,
    history: t.flow.versions.map((v) => ({ version: v.version, published_at: v.published_at ? isoOf(v.published_at) : null })) };
});
on("PUT", "/settings/flow/draft", (db, req) => {
  const { t } = auth(db);
  const def = (req.body as { definition: FlowDefinition }).definition;
  const problem = checkDefinition(def);
  if (problem) throw err(422, "invalid_flow", "Le parcours contient des erreurs.", { errors: [{ loc: "parcours", message: problem }] });
  let draft = t.flow.versions.find((v) => v.published_at === null);
  if (!draft) {
    draft = { id: uuid(), version: Math.max(...t.flow.versions.map((v) => v.version)) + 1, definition: def, published_at: null };
    t.flow.versions.push(draft);
  } else draft.definition = def;
  return { draft_id: draft.id };
});
on("POST", "/settings/flow/publish", (db) => {
  const { t } = auth(db);
  const draft = t.flow.versions.find((v) => v.published_at === null);
  if (!draft) throw err(409, "no_draft", "Aucun brouillon à publier.");
  draft.published_at = now();
  t.flow.published_version_id = draft.id;
  return { published_version: draft.version };
});

// Page publique et parcours
on("GET", "/public/:slug", (db, _req, [slug]) => {
  const t = publicTenant(db, slug);
  const pub = published(t);
  track(t, "page_view");
  return { slug: t.slug, name: t.name, vertical: t.vertical, timezone: t.timezone, branding: t.branding, profile: t.public_profile,
    accepting_bookings: true, services: t.services.filter((s) => s.is_active).map(svcPublic), flow: { version_id: pub.id, intro: pub.definition.intro } };
});
on("POST", "/public/:slug/sessions", (db, req, [slug]) => {
  const t = publicTenant(db, slug);
  const pub = published(t);
  const s = { id: uuid(), token: uuid(), flow_version_id: pub.id, answers: {}, status: "in_progress",
    source: ((req.body as { source?: Record<string, string> })?.source) ?? {}, case_file_id: null };
  t.sessions.push(s);
  track(t, "flow_start", s.id);
  return { session_id: s.id, resume_token: s.token, definition: pub.definition, state: state(pub.definition, {}), answers: {} };
});
on("GET", "/public/:slug/sessions/:id", (db, req, [slug, id]) => {
  const t = publicTenant(db, slug);
  const s = sessionOf(t, id, req);
  const def = defOf(t, s.flow_version_id);
  return { session_id: s.id, status: s.status, definition: def, answers: s.answers, state: state(def, s.answers),
    hold: holdView(activeHold(t, s.id)), files: t.files.filter((f) => f.session_id === s.id).map((f) => ({ id: f.id, original_name: f.original_name })) };
});
on("PUT", "/public/:slug/sessions/:id/answers", (db, req, [slug, id]) => {
  const t = publicTenant(db, slug);
  const s = sessionOf(t, id, req);
  if (s.status !== "in_progress") throw err(409, "already_completed", "Cette demande est déjà envoyée.");
  const def = defOf(t, s.flow_version_id);
  const body = req.body as { step: string; value: unknown };
  const w = walk(def, s.answers);
  if (body.step !== w.current && !w.visited.includes(body.step)) throw err(409, "step_not_reachable", "Cette question n'est pas encore accessible.");
  const step = def.steps.find((x) => x.id === body.step);
  if (!step) throw err(404, "unknown_step", "Question inconnue.");
  try { s.answers = { ...s.answers, [step.id]: validateAnswer(step, body.value) }; } catch (e) {
    if (e instanceof AnswerError) throw err(422, "invalid_answer", e.message, { step: e.step });
    throw e;
  }
  track(t, "step_answer", s.id, step.id);
  const st = state(def, s.answers);
  let hold = activeHold(t, s.id);
  if (hold && st.service_key && t.services.find((x) => x.key === st.service_key)?.id !== hold.service_id) { hold.status = "expired"; hold = undefined; }
  return { answers: s.answers, state: st, hold: holdView(hold) };
});
on("POST", "/public/:slug/sessions/:id/files", async (db, req, [slug, id]) => {
  const t = publicTenant(db, slug);
  const s = sessionOf(t, id, req);
  const file = req.form?.get("file") as File | null;
  if (!file) throw err(422, "invalid_file", "Fichier manquant.");
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) throw err(422, "invalid_file", "Format accepté : JPEG, PNG, WebP ou PDF.");
  if (file.size > 10 * 1024 * 1024) throw err(422, "invalid_file", "Fichier trop volumineux (10 Mo maximum).");
  const f = { id: uuid(), session_id: s.id, case_file_id: null, original_name: file.name.slice(0, 120),
    mime_type: file.type === "application/pdf" ? file.type : "image/jpeg", data_url: await readImage(file) };
  t.files.push(f);
  return { id: f.id, name: file.name };
});
on("GET", "/public/:slug/sessions/:id/slots", (db, req, [slug, id]) => {
  const t = publicTenant(db, slug);
  const s = sessionOf(t, id, req);
  const svc = qualified(t, s);
  // Les créneaux bloqués par ce même parcours restent visibles pour pouvoir être re-choisis.
  const own = activeHold(t, s.id);
  track(t, "slots_view", s.id);
  return slotsResponse(t, svc, req.query.get("from"), Number(req.query.get("days") ?? 7), own?.id);
});
on("POST", "/public/:slug/sessions/:id/hold", (db, req, [slug, id]) => {
  const t = publicTenant(db, slug);
  const s = sessionOf(t, id, req);
  if (s.status !== "in_progress") throw err(409, "already_completed", "Cette demande est déjà envoyée.");
  const svc = qualified(t, s);
  for (const b of t.bookings) if (b.session_id === s.id && b.status === "held") b.status = "expired";
  const slot = takeSlot(t, svc, (req.body as { start: string }).start);
  const b: Booking = { id: uuid(), session_id: s.id, case_file_id: null, service_id: svc.id, resource_id: slot.resource_id, starts_at: slot.start,
    ends_at: slot.end, block: slot.block, status: "held", hold_expires_at: now() + HOLD_MIN * MIN, location: null, token: uuid(), events: [] };
  t.bookings.push(b);
  track(t, "hold", s.id);
  return { hold: holdView(b) };
});
on("POST", "/public/:slug/sessions/:id/confirm", (db, req, [slug, id]) => {
  const t = publicTenant(db, slug);
  const s = sessionOf(t, id, req);
  if (s.status === "completed") {
    const done = t.bookings.find((b) => b.session_id === s.id && b.status === "confirmed");
    if (done) return bookingView(t, done, true);
  }
  const body = req.body as { first_name: string; last_name: string; email: string; phone: string; accept_privacy: boolean;
    consent_sms_reminders: boolean; address: { line: string; postal_code: string; city: string } | null };
  if (!body.accept_privacy) throw err(422, "privacy_required", "Merci d'accepter le traitement de vos données pour ce rendez-vous.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email ?? "")) throw err(422, "validation", "Email invalide.");
  if (body.phone && !/^\+?[0-9 .()-]{6,20}$/.test(body.phone)) throw err(422, "invalid_phone", "Numéro de téléphone invalide.");
  const svc = qualified(t, s);
  const held = activeHold(t, s.id);
  if (!held || held.service_id !== svc.id) throw err(409, "hold_expired", "Le créneau n'est plus réservé pour vous. Merci d'en choisir un nouveau.");
  if (svc.meeting_type === "on_site") {
    if (!body.address) throw err(422, "address_required", "L'adresse du rendez-vous est nécessaire.");
    const pc = body.address.postal_code.replace(/\s/g, "");
    if (t.settings.postal_prefixes.length && !t.settings.postal_prefixes.some((p) => pc.startsWith(p)))
      throw err(422, "out_of_area", "Désolé, cette adresse est en dehors de notre zone d'intervention.");
  }
  if (["on_site", "phone"].includes(svc.meeting_type) && !body.phone) throw err(422, "phone_required", "Un numéro de téléphone est nécessaire pour ce rendez-vous.");
  const def = defOf(t, s.flow_version_id);
  const items = summarize(def, s.answers);
  const contact = { id: uuid(), first_name: body.first_name.trim(), last_name: body.last_name?.trim() || null, email: body.email,
    phone: body.phone?.trim() || null, address: svc.meeting_type === "on_site" ? body.address : null };
  t.contacts.push(contact);
  const answered = items.filter((i) => isAnswered(i.value)).length;
  const cf = { id: uuid(), contact_id: contact.id, service_id: svc.id, status: "new", summary: summaryText(items), answers: items,
    completeness: Math.min(100, Math.round((85 * answered) / Math.max(items.length, 1)) + (contact.phone ? 15 : 0)),
    source: s.source, created_at: now(), notes: [],
    consents: [{ channel: "email", purpose: "transactional", granted: true },
      ...(contact.phone ? [{ channel: "sms", purpose: "transactional", granted: !!body.consent_sms_reminders }] : [])] };
  t.cases.push(cf);
  for (const f of t.files) if (f.session_id === s.id) f.case_file_id = cf.id;
  Object.assign(held, { status: "confirmed", hold_expires_at: null, case_file_id: cf.id, location: contact.address });
  held.events.push({ at: now(), actor: "client", action: "confirmed" });
  s.status = "completed";
  s.case_file_id = cf.id;
  track(t, "booking", s.id);
  notify(t, held, "client_confirmation", contact.email);
  notify(t, held, "business_new_booking", t.notification_email);
  scheduleReminder(t, held, contact.email);
  return bookingView(t, held, true);
});
on("POST", "/public/:slug/events", (db, req, [slug]) => {
  const t = publicTenant(db, slug);
  const b = req.body as { session_id: string; type: string; step: string };
  track(t, b.type, b.session_id, b.step);
});

// Lien de gestion du rendez-vous
function managed(db: DB, slug: string, token: string) {
  const t = publicTenant(db, slug);
  const b = t.bookings.find((x) => x.token === token && x.status !== "held" && x.status !== "expired");
  if (!b) throw err(404, "not_found", "Rendez-vous introuvable.");
  return { t, b };
}
on("GET", "/public/:slug/manage/:token", (db, _r, [slug, token]) => { const { t, b } = managed(db, slug, token); return bookingView(t, b); });
on("POST", "/public/:slug/manage/:token/cancel", (db, _r, [slug, token]) => {
  const { t, b } = managed(db, slug, token);
  if (!bookingView(t, b).can_modify) throw err(409, "too_late", "Ce rendez-vous ne peut plus être modifié en ligne. Contactez l'entreprise.");
  b.status = "cancelled";
  b.events.push({ at: now(), actor: "client", action: "cancelled" });
  const cf = t.cases.find((x) => x.id === b.case_file_id);
  if (cf) cf.status = "cancelled";
  cancelReminders(t, b);
  const c = contactOf(t, b);
  if (c) notify(t, b, "client_cancellation", c.email);
  notify(t, b, "business_cancellation", t.notification_email);
  return bookingView(t, b);
});
on("GET", "/public/:slug/manage/:token/slots", (db, req, [slug, token]) => {
  const { t, b } = managed(db, slug, token);
  return slotsResponse(t, t.services.find((x) => x.id === b.service_id)!, req.query.get("from"), Number(req.query.get("days") ?? 7), b.id);
});
on("POST", "/public/:slug/manage/:token/reschedule", (db, req, [slug, token]) => {
  const { t, b } = managed(db, slug, token);
  if (!bookingView(t, b).can_modify) throw err(409, "too_late", "Ce rendez-vous ne peut plus être modifié en ligne. Contactez l'entreprise.");
  const slot = takeSlot(t, t.services.find((x) => x.id === b.service_id)!, (req.body as { start: string }).start, b.id);
  Object.assign(b, { starts_at: slot.start, ends_at: slot.end, block: slot.block, resource_id: slot.resource_id });
  b.events.push({ at: now(), actor: "client", action: "rescheduled" });
  cancelReminders(t, b);
  const c = contactOf(t, b);
  if (c) { notify(t, b, "client_rescheduled", c.email); scheduleReminder(t, b, c.email); }
  notify(t, b, "business_rescheduled", t.notification_email);
  return bookingView(t, b);
});

/** Point d'entrée : même signature logique que l'API HTTP. */
export async function demoApi(method: string, pathWithQuery: string, body: unknown, form: FormData | undefined, headers: Record<string, string>) {
  const [path, qs] = pathWithQuery.split("?");
  for (const [m, re, handler] of routes) {
    const match = m === method ? re.exec(path) : null;
    if (!match) continue;
    const db = load();
    // Les rappels programmés dont l'heure est passée sont considérés comme « préparés » (aucun envoi en démo).
    for (const t of db.tenants) for (const n of t.notifications)
      if (n.status === "scheduled" && n.scheduled_for <= now()) Object.assign(n, { status: "logged", sent_at: n.scheduled_for, attempts: 1 });
    const result = await handler(db, { method, path, query: new URLSearchParams(qs ?? ""), body, form, headers }, match.slice(1));
    save(db);
    return result;
  }
  throw err(404, "not_found", "Fonction non disponible dans la démonstration.");
}
