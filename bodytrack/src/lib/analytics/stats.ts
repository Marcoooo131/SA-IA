import type { ISODate, WorkoutSession } from '../types';
import type { Ctx } from './context';
import { addDays, dateOf, daysInRange, diffDays, isoWeekday, startOfWeek } from '../dates';
import { muscleVolume, recordTimeline, sessionDurationMs, totalVolume, workingSets, type RecordEvent } from '../calc/training';
import { mean } from '../format';

export interface ActivityStats {
  sessions: number;
  durationMs: number;
  sets: number;
  volume: number;
  sessionList: WorkoutSession[];
}

export function sessionsBetween(ctx: Ctx, from: ISODate, to: ISODate): WorkoutSession[] {
  return ctx.doneSessions.filter((s) => {
    const d = dateOf(s.startedAt);
    return d >= from && d <= to;
  });
}

export function activityStats(ctx: Ctx, from: ISODate, to: ISODate): ActivityStats {
  const list = sessionsBetween(ctx, from, to);
  let durationMs = 0;
  let sets = 0;
  let volume = 0;
  for (const s of list) {
    durationMs += sessionDurationMs(s);
    const ss = ctx.setsBySession.get(s.id) ?? [];
    sets += workingSets(ss).length;
    volume += totalVolume(ss);
  }
  return { sessions: list.length, durationMs, sets, volume, sessionList: list };
}

export function sessionSummary(ctx: Ctx, s: WorkoutSession) {
  const ss = ctx.setsBySession.get(s.id) ?? [];
  const exIds = [...new Set(workingSets(ss).map((x) => x.exerciseId))];
  return { sets: workingSets(ss).length, volume: totalVolume(ss), durationMs: sessionDurationMs(s), exerciseIds: exIds };
}

/** Records successifs de tous les exercices, triés du plus récent au plus ancien */
export function allRecordEvents(ctx: Ctx): RecordEvent[] {
  const ids = new Set<string>();
  for (const s of ctx.doneSessions) for (const x of ctx.setsBySession.get(s.id) ?? []) ids.add(x.exerciseId);
  const out: RecordEvent[] = [];
  for (const id of ids) out.push(...recordTimeline(id, ctx.history(id)));
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Records les plus marquants (1RM estimé et charge) depuis une date, un par exercice et par séance */
export function recentRecords(ctx: Ctx, since: ISODate): RecordEvent[] {
  const ev = allRecordEvents(ctx).filter((e) => e.date >= since && (e.type === 'e1rm' || e.type === 'weight' || e.type === 'reps'));
  const seen = new Set<string>();
  const out: RecordEvent[] = [];
  const priority = { weight: 0, e1rm: 1, reps: 2, setVolume: 3, sessionVolume: 4 } as const;
  ev.sort((a, b) => b.date.localeCompare(a.date) || priority[a.type] - priority[b.type]);
  for (const e of ev) {
    const k = `${e.exerciseId}:${e.sessionId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

export interface NextSession {
  programId: string;
  programName: string;
  dayId: string;
  dayName: string;
  date: ISODate | null;
  label: string;
}

/**
 * Prochaine séance prévue du programme actif :
 * - jours planifiés : prochain jour de la semaine non encore réalisé ;
 * - sinon rotation : le jour qui suit la dernière séance réalisée.
 */
export function nextSession(ctx: Ctx, onDate: ISODate): NextSession | null {
  const program = ctx.data.programs.find((p) => p.isActive && !p.deletedAt && p.days.length);
  if (!program) return null;
  const doneToday = ctx.doneSessions.some((s) => s.programId === program.id && dateOf(s.startedAt) === onDate);
  const scheduled = program.days.filter((d) => d.weekday);
  if (scheduled.length) {
    for (let i = doneToday ? 1 : 0; i < 8; i++) {
      const date = addDays(onDate, i);
      const wd = isoWeekday(date);
      const day = scheduled.find((d) => d.weekday === wd);
      if (day) {
        const label = i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : `Dans ${i} jours`;
        return { programId: program.id, programName: program.name, dayId: day.id, dayName: day.name, date, label };
      }
    }
  }
  const last = [...ctx.doneSessions].reverse().find((s) => s.programId === program.id);
  const idx = last ? program.days.findIndex((d) => d.id === last.programDayId) : -1;
  const day = program.days[(idx + 1) % program.days.length];
  return { programId: program.id, programName: program.name, dayId: day.id, dayName: day.name, date: null, label: 'Prochaine de la rotation' };
}

export interface NutritionAverages {
  days: number;
  loggedDays: number;
  avgKcal: number | null;
  avgProtein: number | null;
  avgCarbs: number | null;
  avgFat: number | null;
  avgTargetKcal: number | null;
  avgTargetProtein: number | null;
  /** Jours où les calories sont à ± 10 % de l'objectif */
  kcalOnTargetDays: number;
  /** Jours où l'objectif protéique est atteint à 90 % ou plus */
  proteinOnTargetDays: number;
}

/** Moyennes nutritionnelles calculées UNIQUEMENT sur les jours où au moins un aliment a été saisi */
export function nutritionAverages(ctx: Ctx, from: ISODate, to: ISODate): NutritionAverages {
  const days = daysInRange(from, to);
  const logged = days.filter((d) => ctx.loggedDates.has(d));
  const totals = logged.map((d) => ({ d, t: ctx.dayTotals(d), g: ctx.goalOn(d) }));
  let kcalOn = 0;
  let protOn = 0;
  for (const x of totals) {
    if (!x.g) continue;
    if (Math.abs(x.t.kcal - x.g.calories) <= x.g.calories * 0.1) kcalOn++;
    if (x.t.protein >= x.g.proteinG * 0.9) protOn++;
  }
  return {
    days: days.length,
    loggedDays: logged.length,
    avgKcal: mean(totals.map((x) => x.t.kcal)),
    avgProtein: mean(totals.map((x) => x.t.protein)),
    avgCarbs: mean(totals.map((x) => x.t.carbs)),
    avgFat: mean(totals.map((x) => x.t.fat)),
    avgTargetKcal: mean(totals.filter((x) => x.g).map((x) => x.g!.calories)),
    avgTargetProtein: mean(totals.filter((x) => x.g).map((x) => x.g!.proteinG)),
    kcalOnTargetDays: kcalOn,
    proteinOnTargetDays: protOn,
  };
}

export function weeklyMuscleVolume(ctx: Ctx, weekStart: ISODate) {
  const list = sessionsBetween(ctx, weekStart, addDays(weekStart, 6));
  const sets = list.flatMap((s) => ctx.setsBySession.get(s.id) ?? []);
  return muscleVolume(sets, ctx.exById);
}

/** Nombre moyen de séances par semaine sur les `weeks` dernières semaines complètes + la semaine en cours */
export function sessionsPerWeek(ctx: Ctx, onDate: ISODate, weeks = 4): number {
  const from = addDays(startOfWeek(onDate), -7 * (weeks - 1));
  const n = sessionsBetween(ctx, from, onDate).length;
  const elapsedWeeks = Math.max(1, (diffDays(from, onDate) + 1) / 7);
  return n / elapsedWeeks;
}

/** Jours avec au moins une donnée saisie (séance, repas ou pesée) */
export function trackedDates(ctx: Ctx): Set<ISODate> {
  const s = new Set<ISODate>(ctx.loggedDates);
  for (const x of ctx.doneSessions) s.add(dateOf(x.startedAt));
  for (const w of ctx.data.weights) s.add(w.date);
  return s;
}
