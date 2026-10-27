import { DateTime, IANAZone } from 'luxon';

/** Fuseau du navigateur, utilisé si ni le profil ni l'équipe n'en définissent un valide */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function isValidTimeZone(zone: string | null | undefined): zone is string {
  return !!zone && IANAZone.isValidZone(zone);
}

/** Fuseau effectif : celui du profil, sinon celui de l'équipe, sinon celui du navigateur */
export function effectiveTimeZone(profileZone?: string | null, teamZone?: string | null): string {
  if (isValidTimeZone(profileZone)) return profileZone;
  if (isValidTimeZone(teamZone)) return teamZone;
  return browserTimeZone();
}

export function listTimeZones(): string[] {
  try {
    const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone');
    if (zones?.length) return zones;
  } catch {
    /* navigateur ancien */
  }
  return ['Europe/Paris', 'Europe/Brussels', 'Europe/Zurich', 'America/Montreal', 'America/Toronto', 'UTC'];
}

export function toZone(iso: string, zone: string): DateTime {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(zone);
}

/** Date + heure saisies dans le fuseau `zone` → instant ISO UTC */
export function localToIso(date: string, time: string, zone: string): string | null {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone });
  return dt.isValid ? dt.toUTC().toISO() : null;
}

export function formatDate(iso: string, zone: string, format = 'cccc d LLLL yyyy'): string {
  return toZone(iso, zone).setLocale('fr').toFormat(format);
}

export function formatTime(iso: string, zone: string): string {
  return toZone(iso, zone).toFormat('HH:mm');
}

/** « mardi 14 janvier · 09:00 – 10:30 » ou « mardi 14 janvier · journée entière » */
export function formatRange(startIso: string, endIso: string, allDay: boolean, zone: string): string {
  return ucfirst(rangeText(startIso, endIso, allDay, zone));
}

function rangeText(startIso: string, endIso: string, allDay: boolean, zone: string): string {
  const start = toZone(startIso, zone).setLocale('fr');
  const end = toZone(endIso, zone).setLocale('fr');
  if (allDay) {
    const lastDay = end.minus({ days: 1 });
    if (lastDay.hasSame(start, 'day')) return `${start.toFormat('cccc d LLLL')} · journée entière`;
    return `du ${start.toFormat('d LLL')} au ${lastDay.toFormat('d LLL yyyy')}`;
  }
  if (end.hasSame(start, 'day')) {
    return `${start.toFormat('cccc d LLLL')} · ${start.toFormat('HH:mm')} – ${end.toFormat('HH:mm')}`;
  }
  return `${start.toFormat('d LLL HH:mm')} → ${end.toFormat('d LLL HH:mm')}`;
}

/** Majuscule initiale seulement (« mardi 27 octobre » → « Mardi 27 octobre ») */
export function ucfirst(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function relativeTime(iso: string): string {
  const dt = DateTime.fromISO(iso).setLocale('fr');
  const diff = DateTime.now().diff(dt, 'seconds').seconds;
  if (Math.abs(diff) < 45) return "à l'instant";
  return dt.toRelative() ?? '';
}

/** Libellé court du décalage horaire, ex. « UTC+1 » */
export function zoneOffsetLabel(zone: string): string {
  return DateTime.now().setZone(zone).toFormat("'UTC'ZZ").replace(':00', '');
}
