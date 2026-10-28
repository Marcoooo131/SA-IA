// Fonction Edge « calendar-feed » — abonnement Outlook / Google / Apple (format iCalendar).
//
// Chaque membre obtient dans « Mon profil » un lien secret :
//   https://<projet>.supabase.co/functions/v1/calendar-feed?t=<jeton>
// Outlook > Ajouter un calendrier > S'abonner à partir du web, puis coller ce lien.
// Le flux contient les rendez-vous dont la personne est RESPONSABLE (60 jours passés → 1 an à venir),
// avec un rappel 15 minutes avant. Lecture seule : on modifie toujours dans l'agenda.
// Déploiement : verify_jwt = false (le jeton du lien sert d'authentification).
import { createClient } from 'npm:@supabase/supabase-js@2';

const APP_URL = Deno.env.get('AGENDA_APP_URL') ?? 'https://marcoooo131.github.io/SA-IA/agenda/';

function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lignes de 75 octets maximum, comme l'exige la norme iCalendar */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join('\r\n ');
}

function utc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Date (AAAAMMJJ) d'un instant dans le fuseau de l'équipe, pour les rendez-vous « journée entière » */
function localDate(iso: string, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  return parts.replace(/-/g, '');
}

const STATUS_LABEL: Record<string, string> = {
  a_confirmer: 'À confirmer', confirme: 'Confirmé', en_cours: 'En cours', termine: 'Terminé', annule: 'Annulé', reporte: 'Reporté',
};

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('t') ?? '';
  if (!/^[0-9a-f]{64}$/.test(token)) return new Response('Lien d\'abonnement invalide.', { status: 404 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: feed } = await db.from('calendar_feeds').select('user_id').eq('token', token).maybeSingle();
  if (!feed) return new Response('Lien d\'abonnement invalide ou régénéré.', { status: 404 });
  const { data: me } = await db.from('profiles').select('id, full_name, is_active').eq('id', feed.user_id).maybeSingle();
  if (!me?.is_active) return new Response('Compte désactivé.', { status: 403 });

  const { data: settings } = await db.from('app_settings').select('organization_name, timezone').maybeSingle();
  const zone = settings?.timezone ?? 'Europe/Paris';
  const now = Date.now();
  const { data: rows, error } = await db
    .from('appointments')
    .select('id, title, starts_at, ends_at, all_day, client_name, location, description, notes, status, links, updated_at, category_id')
    .eq('responsible_id', me.id)
    .gte('ends_at', new Date(now - 60 * 86_400_000).toISOString())
    .lte('starts_at', new Date(now + 365 * 86_400_000).toISOString())
    .order('starts_at')
    .limit(2000);
  if (error) return new Response('Agenda momentanément indisponible.', { status: 503 });

  const { data: categories } = await db.from('categories').select('id, name');
  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Agenda partage//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(`${settings?.organization_name ?? 'Agenda'} – ${me.full_name || 'mes rendez-vous'}`)}`,
    `X-WR-TIMEZONE:${zone}`,
    // Indication de rafraîchissement (Outlook décide lui-même de la fréquence réelle)
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
  ];
  for (const a of rows ?? []) {
    const details = [
      a.client_name ? `Client : ${a.client_name}` : '',
      `Statut : ${STATUS_LABEL[a.status] ?? a.status}`,
      a.category_id && categoryName.get(a.category_id) ? `Catégorie : ${categoryName.get(a.category_id)}` : '',
      a.description ?? '',
      a.notes ? `Notes : ${a.notes}` : '',
      ...(Array.isArray(a.links) ? a.links.map((l: { label?: string; url: string }) => `${l.label || 'Lien'} : ${l.url}`) : []),
      `Fiche : ${APP_URL}#/agenda?rdv=${a.id}`,
    ].filter(Boolean);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${a.id}@agenda-partage`,
      `DTSTAMP:${utc(a.updated_at)}`,
      `LAST-MODIFIED:${utc(a.updated_at)}`,
      ...(a.all_day
        ? [`DTSTART;VALUE=DATE:${localDate(a.starts_at, zone)}`, `DTEND;VALUE=DATE:${localDate(a.ends_at, zone)}`]
        : [`DTSTART:${utc(a.starts_at)}`, `DTEND:${utc(a.ends_at)}`]),
      `SUMMARY:${esc(a.status === 'annule' ? `[Annulé] ${a.title}` : a.title)}`,
      `DESCRIPTION:${esc(details.join('\n'))}`,
      ...(a.location ? [`LOCATION:${esc(a.location)}`] : []),
      `URL:${APP_URL}#/agenda?rdv=${a.id}`,
      `STATUS:${a.status === 'annule' ? 'CANCELLED' : a.status === 'a_confirmer' ? 'TENTATIVE' : 'CONFIRMED'}`,
    );
    if (a.status !== 'annule' && !a.all_day) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(a.title)}`, 'TRIGGER:-PT15M', 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');

  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="agenda.ics"',
      'Cache-Control': 'no-store',
    },
  });
});
