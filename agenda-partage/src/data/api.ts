import { supabase } from '../lib/supabase';
import type {
  AppNotification,
  AppSettings,
  Appointment,
  AppointmentRow,
  AppointmentWrite,
  Attachment,
  Category,
  Comment,
  Conflict,
  HistoryEntry,
  Profile,
  Role,
} from '../lib/types';

/** Lève l'erreur Supabase pour que l'appelant l'affiche */
function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

// ------------------------------------------------------------------ équipe et paramètres
export async function fetchProfiles(): Promise<Profile[]> {
  return check(await supabase.from('profiles').select('*').order('full_name')) as Profile[];
}

export async function fetchProfile(id: string): Promise<Profile | null> {
  return check(await supabase.from('profiles').select('*').eq('id', id).maybeSingle()) as Profile | null;
}

export async function updateProfile(
  id: string,
  patch: Partial<Pick<Profile, 'full_name' | 'color' | 'phone' | 'timezone' | 'role' | 'is_active' | 'can_edit_all'>>,
): Promise<void> {
  check(await supabase.from('profiles').update(patch).eq('id', id).select('id').single());
}

export async function fetchCategories(): Promise<Category[]> {
  return check(await supabase.from('categories').select('*').order('position').order('name')) as Category[];
}

export async function upsertCategory(c: Partial<Category> & { name: string }): Promise<void> {
  if (c.id) {
    const { id, ...patch } = c;
    check(await supabase.from('categories').update(patch).eq('id', id).select('id').single());
  } else {
    check(await supabase.from('categories').insert(c));
  }
}

export async function deleteCategory(id: string): Promise<void> {
  check(await supabase.from('categories').delete().eq('id', id));
}

export async function fetchSettings(): Promise<AppSettings | null> {
  return check(await supabase.from('app_settings').select('*').maybeSingle()) as AppSettings | null;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  check(await supabase.from('app_settings').update(patch).eq('id', true).select('id').single());
}

// ------------------------------------------------------------------ rendez-vous
export async function fetchAgenda(from: Date, to: Date): Promise<Appointment[]> {
  const data = check(
    await supabase.rpc('agenda_between', { p_from: from.toISOString(), p_to: to.toISOString() }),
  ) as Appointment[];
  return data.map((a) => ({ ...a, links: Array.isArray(a.links) ? a.links : [] }));
}

export async function fetchAppointment(id: string): Promise<AppointmentRow | null> {
  return check(await supabase.from('appointments').select('*').eq('id', id).maybeSingle()) as AppointmentRow | null;
}

export async function searchAppointments(query: string, limit = 30): Promise<AppointmentRow[]> {
  return check(await supabase.rpc('search_appointments', { p_query: query, p_limit: limit })) as AppointmentRow[];
}

export async function findConflicts(
  responsibleId: string,
  startsAt: string,
  endsAt: string,
  excludeId?: string | null,
): Promise<Conflict[]> {
  return check(
    await supabase.rpc('find_conflicts', {
      p_responsible_id: responsibleId,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_exclude_id: excludeId ?? null,
    }),
  ) as Conflict[];
}

export async function createAppointment(payload: AppointmentWrite): Promise<AppointmentRow> {
  return check(await supabase.from('appointments').insert(payload).select('*').single()) as AppointmentRow;
}

export async function updateAppointment(id: string, patch: Partial<AppointmentWrite>): Promise<AppointmentRow> {
  const res = await supabase.from('appointments').update(patch).eq('id', id).select('*').maybeSingle();
  const row = check(res) as AppointmentRow | null;
  if (!row) throw Object.assign(new Error("Vous n'avez pas l'autorisation de modifier ce rendez-vous."), { code: '42501' });
  return row;
}

export async function deleteAppointment(id: string): Promise<void> {
  // Les fichiers stockés ne sont pas supprimés par la base : on les retire d'abord
  const files = await fetchAttachments(id).catch(() => [] as Attachment[]);
  if (files.length) await supabase.storage.from('attachments').remove(files.map((f) => f.storage_path));
  const res = await supabase.from('appointments').delete().eq('id', id).select('id');
  const rows = check(res) as { id: string }[];
  if (!rows.length) throw Object.assign(new Error("Vous n'avez pas l'autorisation de supprimer ce rendez-vous."), { code: '42501' });
}

// ------------------------------------------------------------------ commentaires, pièces jointes, historique
export async function fetchComments(appointmentId: string): Promise<Comment[]> {
  return check(
    await supabase.from('appointment_comments').select('*').eq('appointment_id', appointmentId).order('created_at'),
  ) as Comment[];
}

export async function addComment(appointmentId: string, body: string, kind: Comment['kind']): Promise<void> {
  check(await supabase.from('appointment_comments').insert({ appointment_id: appointmentId, body: body.trim(), kind }));
}

export async function deleteComment(id: string): Promise<void> {
  check(await supabase.from('appointment_comments').delete().eq('id', id));
}

export async function fetchAttachments(appointmentId: string): Promise<Attachment[]> {
  return check(
    await supabase.from('appointment_attachments').select('*').eq('appointment_id', appointmentId).order('created_at'),
  ) as Attachment[];
}

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export async function uploadAttachment(appointmentId: string, file: File): Promise<void> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`« ${file.name} » dépasse 10 Mo.`);
  const safeName = file.name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-120) || 'fichier';
  const path = `${appointmentId}/${crypto.randomUUID()}-${safeName}`;
  check(await supabase.storage.from('attachments').upload(path, file, { contentType: file.type || undefined, upsert: false }));
  const res = await supabase.from('appointment_attachments').insert({
    appointment_id: appointmentId,
    storage_path: path,
    file_name: file.name.slice(0, 255),
    size_bytes: file.size,
    mime_type: file.type || null,
  });
  if (res.error) {
    await supabase.storage.from('attachments').remove([path]);
    throw res.error;
  }
}

export async function attachmentUrl(path: string): Promise<string> {
  const data = check(await supabase.storage.from('attachments').createSignedUrl(path, 300)) as { signedUrl: string };
  return data.signedUrl;
}

export async function deleteAttachment(a: Attachment): Promise<void> {
  const res = await supabase.from('appointment_attachments').delete().eq('id', a.id).select('id');
  const rows = check(res) as { id: string }[];
  if (!rows.length) throw Object.assign(new Error("Vous n'avez pas l'autorisation de supprimer ce fichier."), { code: '42501' });
  await supabase.storage.from('attachments').remove([a.storage_path]);
}

export async function fetchHistory(appointmentId: string): Promise<HistoryEntry[]> {
  return check(
    await supabase
      .from('appointment_history')
      .select('*')
      .eq('appointment_id', appointmentId)
      .order('created_at', { ascending: false })
      .limit(100),
  ) as HistoryEntry[];
}

export async function fetchRecentHistory(limit = 15): Promise<HistoryEntry[]> {
  return check(
    await supabase.from('appointment_history').select('*').order('created_at', { ascending: false }).limit(limit),
  ) as HistoryEntry[];
}

// ------------------------------------------------------------------ notifications internes
export async function fetchNotifications(limit = 30): Promise<AppNotification[]> {
  return check(
    await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit),
  ) as AppNotification[];
}

export async function markNotificationsRead(ids: number[]): Promise<void> {
  if (!ids.length) return;
  check(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids));
}

// ------------------------------------------------------------------ administration des comptes
export interface InviteRequest {
  email: string;
  full_name: string;
  role: Role;
  /** Si renseigné : compte créé directement avec ce mot de passe provisoire (pas d'e-mail envoyé) */
  password?: string;
  redirect_to?: string;
}

/**
 * Création / suppression de comptes : nécessite la clé secrète, donc passe par la fonction Edge
 * « admin-users » exécutée sur les serveurs Supabase (jamais dans le navigateur).
 */
export async function adminUsers(
  body: ({ action: 'invite' } & InviteRequest) | { action: 'delete' | 'ban' | 'unban'; user_id: string },
): Promise<{ ok: true; user_id?: string }> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let detail = '';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') detail = ((await ctx.json()) as { error?: string }).error ?? '';
    } catch {
      /* corps illisible */
    }
    if (!detail && /Failed to send a request|404|not found/i.test(error.message)) {
      detail =
        "La fonction « admin-users » n'est pas déployée sur Supabase. Voir le guide (section Fonction d'administration), " +
        'ou ajoutez l\'utilisateur depuis Supabase > Authentication > Users.';
    }
    throw new Error(detail || error.message);
  }
  return data as { ok: true; user_id?: string };
}
