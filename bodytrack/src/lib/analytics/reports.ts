import type { BodyMeasurement, ISODate, MeasurementKey, PhotoPose, ProgressPhoto } from '../types';
import type { Ctx } from './context';
import { addDays, daysInRange, diffDays, endOfMonth, startOfMonth } from '../dates';
import { activityStats, allRecordEvents, nutritionAverages, type NutritionAverages } from './stats';
import { allInsights, topRecommendations, type Insight } from './coach';
import { cleanLogs, movingAverage } from '../calc/weight';
import { isStagnating, workingSets, type RecordEvent } from '../calc/training';
import { mean, round } from '../format';

export interface ExerciseChange {
  exerciseId: string;
  name: string;
  before: number;
  after: number;
  deltaPct: number;
}

/** Évolution du meilleur 1RM estimé : période vs période précédente de même durée */
function exerciseChanges(ctx: Ctx, from: ISODate, to: ISODate): ExerciseChange[] {
  const len = diffDays(from, to) + 1;
  const prevFrom = addDays(from, -len);
  const ids = new Set<string>();
  for (const s of ctx.doneSessions) {
    const d = ctx.sessionDate(s);
    if (d >= from && d <= to) for (const x of workingSets(ctx.setsBySession.get(s.id) ?? [])) ids.add(x.exerciseId);
  }
  const out: ExerciseChange[] = [];
  for (const id of ids) {
    const h = ctx.history(id);
    const cur = h.filter((p) => p.date >= from && p.date <= to && p.bestE1rm);
    // Référence : meilleure performance de la période précédente, sinon première séance de la période
    const prev = h.filter((p) => p.date >= prevFrom && p.date < from && p.bestE1rm);
    const after = Math.max(...cur.map((p) => p.bestE1rm!));
    const before = prev.length ? Math.max(...prev.map((p) => p.bestE1rm!)) : cur.length >= 2 ? cur[0].bestE1rm! : NaN;
    if (!cur.length || !Number.isFinite(before) || !Number.isFinite(after)) continue;
    out.push({ exerciseId: id, name: ctx.exById.get(id)?.name ?? 'Exercice', before: round(before, 1), after: round(after, 1), deltaPct: round(((after - before) / before) * 100, 1) });
  }
  return out.sort((a, b) => b.deltaPct - a.deltaPct);
}

export interface ConsistencyComponent {
  key: string;
  label: string;
  weight: number;
  ratio: number;
  detail: string;
}

/**
 * Score de régularité (0 à 100). Il mesure l'ASSIDUITÉ du suivi, pas la qualité physique :
 *  - 40 pts : séances réalisées / séances prévues (objectif hebdomadaire du profil) ;
 *  - 30 pts : jours avec un journal alimentaire / jours de la période ;
 *  - 20 pts : jours saisis où l'objectif protéique est atteint à 90 % ;
 *  - 10 pts : pesées (3 par semaine suffisent pour le maximum).
 */
export function consistencyScore(ctx: Ctx, from: ISODate, to: ISODate): { score: number; components: ConsistencyComponent[] } {
  const days = diffDays(from, to) + 1;
  const target = ctx.data.profile?.trainingDaysPerWeek ?? 3;
  const planned = Math.max(1, (target * days) / 7);
  const a = activityStats(ctx, from, to);
  const n = nutritionAverages(ctx, from, to);
  const weighIns = new Set(ctx.data.weights.filter((w) => w.date >= from && w.date <= to).map((w) => w.date)).size;
  const weighTarget = Math.max(1, (3 * days) / 7);
  const components: ConsistencyComponent[] = [
    { key: 'training', label: 'Séances', weight: 40, ratio: Math.min(1, a.sessions / planned), detail: `${a.sessions} séance(s) sur ${round(planned, 1).toLocaleString('fr-FR')} prévue(s)` },
    { key: 'logging', label: 'Journal alimentaire', weight: 30, ratio: Math.min(1, n.loggedDays / days), detail: `${n.loggedDays} jour(s) saisi(s) sur ${days}` },
    { key: 'protein', label: 'Objectif protéique', weight: 20, ratio: n.loggedDays ? n.proteinOnTargetDays / n.loggedDays : 0, detail: `${n.proteinOnTargetDays} jour(s) sur ${n.loggedDays} saisi(s)` },
    { key: 'weighins', label: 'Pesées', weight: 10, ratio: Math.min(1, weighIns / weighTarget), detail: `${weighIns} pesée(s), ${Math.ceil(weighTarget)} visée(s)` },
  ];
  const score = Math.round(components.reduce((s, c) => s + c.weight * c.ratio, 0));
  return { score, components };
}

export interface WeeklyReport {
  weekStart: ISODate;
  weekEnd: ISODate;
  sessions: number;
  plannedSessions: number;
  durationMs: number;
  sets: number;
  volume: number;
  prevVolume: number;
  records: RecordEvent[];
  loadChanges: ExerciseChange[];
  nutrition: NutritionAverages;
  targetKcal: number | null;
  targetProtein: number | null;
  weightAvg: number | null;
  prevWeightAvg: number | null;
  consistency: ReturnType<typeof consistencyScore>;
  recommendations: Insight[];
}

export function weeklyReport(ctx: Ctx, weekStart: ISODate, today: ISODate): WeeklyReport {
  const weekEnd = addDays(weekStart, 6);
  const end = weekEnd > today ? today : weekEnd;
  const a = activityStats(ctx, weekStart, end);
  const prev = activityStats(ctx, addDays(weekStart, -7), addDays(weekStart, -1));
  const n = nutritionAverages(ctx, weekStart, end);
  const goal = ctx.goalOn(end);
  const records = allRecordEvents(ctx).filter((r) => r.date >= weekStart && r.date <= end && (r.type === 'e1rm' || r.type === 'weight' || r.type === 'reps'));
  return {
    weekStart,
    weekEnd,
    sessions: a.sessions,
    plannedSessions: ctx.data.profile?.trainingDaysPerWeek ?? 0,
    durationMs: a.durationMs,
    sets: a.sets,
    volume: a.volume,
    prevVolume: prev.volume,
    records,
    loadChanges: exerciseChanges(ctx, weekStart, end),
    nutrition: n,
    targetKcal: goal?.calories ?? null,
    targetProtein: goal?.proteinG ?? null,
    weightAvg: mean(cleanLogs(ctx.data.weights).filter((w) => w.date >= weekStart && w.date <= end).map((w) => w.weightKg)),
    prevWeightAvg: mean(cleanLogs(ctx.data.weights).filter((w) => w.date >= addDays(weekStart, -7) && w.date < weekStart).map((w) => w.weightKg)),
    consistency: consistencyScore(ctx, weekStart, end),
    recommendations: topRecommendations(allInsights(ctx, end), 3),
  };
}

export interface MonthlyReport {
  monthStart: ISODate;
  monthEnd: ISODate;
  weightStart: number | null;
  weightEnd: number | null;
  weightChange: number | null;
  weightSeries: { date: ISODate; weightKg: number }[];
  measurementsStart: BodyMeasurement | null;
  measurementsEnd: BodyMeasurement | null;
  photos: { pose: PhotoPose; first: ProgressPhoto; last: ProgressPhoto }[];
  sessions: number;
  durationMs: number;
  sets: number;
  volume: number;
  records: RecordEvent[];
  mostProgressed: ExerciseChange[];
  stagnating: { exerciseId: string; name: string }[];
  nutrition: NutritionAverages;
  targetKcal: number | null;
  targetProtein: number | null;
  consistency: ReturnType<typeof consistencyScore>;
}

export function monthlyReport(ctx: Ctx, anyDayInMonth: ISODate, today: ISODate): MonthlyReport {
  const monthStart = startOfMonth(anyDayInMonth);
  const monthEndFull = endOfMonth(anyDayInMonth);
  const monthEnd = monthEndFull > today ? today : monthEndFull;
  const logs = cleanLogs(ctx.data.weights).filter((w) => w.date >= monthStart && w.date <= monthEnd);
  // Début / fin de mois : moyenne des 7 premiers / 7 derniers jours (plus fiable qu'une pesée isolée)
  const firstWeek = logs.filter((w) => w.date <= addDays(monthStart, 6));
  const lastWeek = logs.filter((w) => w.date >= addDays(monthEnd, -6));
  const weightStart = firstWeek.length ? mean(firstWeek.map((w) => w.weightKg)) : logs.length ? logs[0].weightKg : null;
  const weightEnd = lastWeek.length ? movingAverage(ctx.data.weights, monthEnd, 7) : logs.length ? logs[logs.length - 1].weightKg : null;
  const ms = ctx.data.measurements.filter((m) => m.date <= monthEnd).sort((a, b) => a.date.localeCompare(b.date));
  const inMonth = ms.filter((m) => m.date >= monthStart);
  const before = ms.filter((m) => m.date < monthStart);
  const photosInMonth = ctx.data.photos.filter((p) => p.date >= monthStart && p.date <= monthEnd).sort((a, b) => a.date.localeCompare(b.date));
  const photos: MonthlyReport['photos'] = [];
  for (const pose of ['front', 'side', 'back'] as PhotoPose[]) {
    const ps = photosInMonth.filter((p) => p.pose === pose);
    if (ps.length >= 2) photos.push({ pose, first: ps[0], last: ps[ps.length - 1] });
  }
  const a = activityStats(ctx, monthStart, monthEnd);
  const changes = exerciseChanges(ctx, monthStart, monthEnd);
  const stagnating: { exerciseId: string; name: string }[] = [];
  for (const c of changes) if (isStagnating(ctx.history(c.exerciseId).filter((p) => p.date <= monthEnd), 3)) stagnating.push({ exerciseId: c.exerciseId, name: c.name });
  const goal = ctx.goalOn(monthEnd);
  return {
    monthStart,
    monthEnd,
    weightStart,
    weightEnd,
    weightChange: weightStart !== null && weightEnd !== null ? weightEnd - weightStart : null,
    weightSeries: logs,
    measurementsStart: inMonth.length >= 2 ? inMonth[0] : (before[before.length - 1] ?? null),
    measurementsEnd: inMonth.length ? inMonth[inMonth.length - 1] : null,
    photos,
    sessions: a.sessions,
    durationMs: a.durationMs,
    sets: a.sets,
    volume: a.volume,
    records: allRecordEvents(ctx).filter((r) => r.date >= monthStart && r.date <= monthEnd && (r.type === 'e1rm' || r.type === 'weight')),
    mostProgressed: changes.filter((c) => c.deltaPct > 0).slice(0, 5),
    stagnating: stagnating.slice(0, 5),
    nutrition: nutritionAverages(ctx, monthStart, monthEnd),
    targetKcal: goal?.calories ?? null,
    targetProtein: goal?.proteinG ?? null,
    consistency: consistencyScore(ctx, monthStart, monthEnd),
  };
}

export const MEASUREMENT_FIELDS: { key: MeasurementKey; label: string }[] = [
  { key: 'chestCm', label: 'Poitrine' },
  { key: 'waistCm', label: 'Taille' },
  { key: 'armCm', label: 'Bras' },
  { key: 'thighCm', label: 'Cuisses' },
  { key: 'hipsCm', label: 'Hanches' },
  { key: 'calfCm', label: 'Mollets' },
];

export { daysInRange };
