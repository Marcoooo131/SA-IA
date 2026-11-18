// Calcul des créneaux (version navigateur) — traduction de backend/venio/scheduling/*.py.

export type Rule = { weekday: number; start_time: string; end_time: string };
export type Interval = [number, number]; // millisecondes UTC
export type ServiceSpec = {
  duration_min: number; buffer_before_min: number; buffer_after_min: number;
  slot_interval_min: number; min_notice_min: number; max_horizon_days: number;
};

const MIN = 60_000;

function easterSunday(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (isoDate: string, n: number) => { const d = new Date(`${isoDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

export function isHoliday(country: string | null, isoDate: string): boolean {
  if (country !== "FR") return false;
  const y = Number(isoDate.slice(0, 4));
  const e = iso(easterSunday(y));
  const fixed = ["01-01", "05-01", "05-08", "07-14", "08-15", "11-01", "11-11", "12-25"].map((md) => `${y}-${md}`);
  return [...fixed, plusDays(e, 1), plusDays(e, 39), plusDays(e, 50)].includes(isoDate);
}

/** Décalage (ms) du fuseau à un instant donné. */
function tzOffset(tz: string, utcMs: number): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs;
}

/** Heure locale (date ISO + HH:MM) d'un fuseau → instant UTC (ms). */
export function zonedToUtc(isoDate: string, hhmm: string, tz: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const [y, mo, d] = isoDate.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m);
  const first = guess - tzOffset(tz, guess);
  return guess - tzOffset(tz, first);
}

export function localDate(utcMs: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(utcMs));
}
export function localTime(utcMs: number, tz: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(utcMs));
}
const isoWeekday = (isoDate: string) => ((new Date(`${isoDate}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

export function computeSlots(
  spec: ServiceSpec, resources: { id: string; rules: Rule[]; busy: Interval[] }[],
  dayFrom: string, dayTo: string, tz: string, now: number, holidays: string | null,
): { start: number; end: number; resource_ids: string[] }[] {
  const earliest = now + spec.min_notice_min * MIN;
  const latest = now + spec.max_horizon_days * 1440 * MIN;
  const dur = spec.duration_min * MIN;
  const byStart = new Map<number, string[]>();
  for (let day = dayFrom; day <= dayTo; day = plusDays(day, 1)) {
    if (isHoliday(holidays, day)) continue;
    const wd = isoWeekday(day);
    for (const r of resources) {
      for (const rule of r.rules.filter((x) => x.weekday === wd)) {
        const ws = zonedToUtc(day, rule.start_time, tz), we = zonedToUtc(day, rule.end_time, tz);
        for (let t = ws; t + dur <= we; t += spec.slot_interval_min * MIN) {
          if (t < earliest || t > latest) continue;
          const bs = t - spec.buffer_before_min * MIN, be = t + dur + spec.buffer_after_min * MIN;
          if (r.busy.some(([s, e]) => bs < e && s < be)) continue;
          byStart.set(t, [...(byStart.get(t) ?? []), r.id]);
        }
      }
    }
  }
  return [...byStart.entries()].sort((a, b) => a[0] - b[0]).map(([s, ids]) => ({ start: s, end: s + dur, resource_ids: [...new Set(ids)] }));
}

export { plusDays };
