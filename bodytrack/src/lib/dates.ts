import type { ISODate } from './types';

/** Date locale au format AAAA-MM-JJ (jamais en UTC : évite les décalages en soirée) */
export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today(): ISODate {
  return toISODate(new Date());
}

/** Analyse une date AAAA-MM-JJ à midi local (robuste aux changements d'heure) */
export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function addMonths(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

/** Nombre de jours entre deux dates (b - a) */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

/** Lundi de la semaine contenant la date */
export function startOfWeek(s: ISODate): ISODate {
  const d = parseISODate(s);
  const dow = (d.getDay() + 6) % 7; // 0 = lundi
  return addDays(s, -dow);
}

export function startOfMonth(s: ISODate): ISODate {
  return `${s.slice(0, 7)}-01`;
}

export function endOfMonth(s: ISODate): ISODate {
  const d = parseISODate(startOfMonth(s));
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
}

/** 1 = lundi … 7 = dimanche */
export function isoWeekday(s: ISODate): number {
  const d = parseISODate(s).getDay();
  return d === 0 ? 7 : d;
}

export function dateOf(dt: string): ISODate {
  // Un horodatage ISO est converti en date locale
  if (dt.length <= 10) return dt;
  return toISODate(new Date(dt));
}

export function isBetween(s: ISODate, from: ISODate, to: ISODate): boolean {
  return s >= from && s <= to;
}

export function daysInRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function ageFromBirthDate(birth: ISODate, on: ISODate = today()): number {
  const b = parseISODate(birth);
  const o = parseISODate(on);
  let age = o.getFullYear() - b.getFullYear();
  const m = o.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && o.getDate() < b.getDate())) age--;
  return age;
}

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const weekdayName = (n: number) => WEEKDAYS[(n - 1 + 7) % 7];
export const weekdayShort = (n: number) => WEEKDAYS[(n - 1 + 7) % 7].slice(0, 3);

export function formatDate(s: ISODate, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  return parseISODate(s).toLocaleDateString('fr-FR', opts);
}

export function formatLongDate(s: ISODate): string {
  return formatDate(s, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatMonth(s: ISODate): string {
  return formatDate(s, { month: 'long', year: 'numeric' });
}

export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
