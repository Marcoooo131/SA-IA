import type { Exercise, MuscleGroup, WorkoutSession, WorkoutSet } from '../types';
import { dateOf } from '../dates';
import { linearRegression, round } from '../format';

/**
 * 1RM estimé — formule d'Epley : charge × (1 + répétitions / 30).
 * Il s'agit d'une ESTIMATION, d'autant moins fiable au-delà de 10 répétitions.
 */
export function epley1RM(weightKg: number | null | undefined, reps: number | null | undefined): number | null {
  if (!weightKg || !reps || weightKg <= 0 || reps <= 0) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export const isE1rmReliable = (reps: number) => reps >= 1 && reps <= 10;

export function setVolume(s: Pick<WorkoutSet, 'weightKg' | 'reps'>): number {
  const w = s.weightKg ?? 0;
  const r = s.reps ?? 0;
  return w > 0 && r > 0 ? w * r : 0;
}

/** Séries de travail : validées, hors échauffement, non supprimées, avec au moins une répétition */
export function workingSets<T extends WorkoutSet>(sets: T[]): T[] {
  return sets.filter((s) => !s.deletedAt && s.done && !s.isWarmup && (s.reps ?? 0) > 0);
}

export function totalVolume(sets: WorkoutSet[]): number {
  return workingSets(sets).reduce((a, s) => a + setVolume(s), 0);
}

export interface PerfSet {
  weightKg: number;
  reps: number;
}

export interface ExercisePerformance {
  sessionId: string;
  date: string;
  startedAt: string;
  sets: PerfSet[];
  bestWeight: number;
  repsAtBestWeight: number;
  maxReps: number;
  bestE1rm: number | null;
  bestSetVolume: number;
  volume: number;
}

export function performanceFromSets(session: Pick<WorkoutSession, 'id' | 'startedAt'>, sets: WorkoutSet[]): ExercisePerformance | null {
  const ws = workingSets(sets).sort((a, b) => a.position - b.position);
  if (!ws.length) return null;
  const perf: PerfSet[] = ws.map((s) => ({ weightKg: s.weightKg ?? 0, reps: s.reps ?? 0 }));
  let bestWeight = 0;
  let repsAtBestWeight = 0;
  let maxReps = 0;
  let bestE1rm: number | null = null;
  let bestSetVolume = 0;
  let volume = 0;
  for (const p of perf) {
    if (p.weightKg > bestWeight || (p.weightKg === bestWeight && p.reps > repsAtBestWeight)) {
      bestWeight = p.weightKg;
      repsAtBestWeight = p.reps;
    }
    maxReps = Math.max(maxReps, p.reps);
    const e = epley1RM(p.weightKg, p.reps);
    if (e !== null && (bestE1rm === null || e > bestE1rm)) bestE1rm = e;
    const v = p.weightKg * p.reps;
    bestSetVolume = Math.max(bestSetVolume, v);
    volume += v;
  }
  return {
    sessionId: session.id,
    date: dateOf(session.startedAt),
    startedAt: session.startedAt,
    sets: perf,
    bestWeight,
    repsAtBestWeight,
    maxReps,
    bestE1rm,
    bestSetVolume,
    volume,
  };
}

/** Historique chronologique des performances d'un exercice (séances terminées uniquement par défaut) */
export function exerciseHistory(
  exerciseId: string,
  sessions: WorkoutSession[],
  sets: WorkoutSet[],
  opts: { includeActive?: boolean; excludeSessionId?: string } = {},
): ExercisePerformance[] {
  const bySession = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || s.deletedAt) continue;
    const arr = bySession.get(s.sessionId) ?? [];
    arr.push(s);
    bySession.set(s.sessionId, arr);
  }
  const out: ExercisePerformance[] = [];
  for (const sess of sessions) {
    if (sess.deletedAt || sess.id === opts.excludeSessionId) continue;
    if (sess.status !== 'done' && !opts.includeActive) continue;
    const ss = bySession.get(sess.id);
    if (!ss) continue;
    const p = performanceFromSets(sess, ss);
    if (p) out.push(p);
  }
  return out.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export interface Comparison {
  kind: 'first' | 'progress' | 'stable' | 'regress';
  weightDelta: number;
  repsDelta: number;
  volumeDelta: number;
  e1rmDelta: number | null;
  messages: string[];
}

const kg = (n: number) => `${round(n, 2).toLocaleString('fr-FR')} kg`;

/** Compare une performance à la précédente sur le même exercice */
export function comparePerformances(current: ExercisePerformance, previous: ExercisePerformance | null | undefined): Comparison {
  if (!previous) {
    return { kind: 'first', weightDelta: 0, repsDelta: 0, volumeDelta: 0, e1rmDelta: null, messages: ['Première séance enregistrée sur cet exercice.'] };
  }
  const weightDelta = round(current.bestWeight - previous.bestWeight, 2);
  const repsDelta = current.bestWeight === previous.bestWeight ? current.repsAtBestWeight - previous.repsAtBestWeight : 0;
  const volumeDelta = round(current.volume - previous.volume, 1);
  const e1rmDelta = current.bestE1rm !== null && previous.bestE1rm !== null ? round(current.bestE1rm - previous.bestE1rm, 1) : null;
  const messages: string[] = [];
  if (weightDelta > 0) messages.push(`Charge en hausse : ${kg(current.bestWeight)} contre ${kg(previous.bestWeight)}.`);
  else if (weightDelta < 0) messages.push(`Charge en baisse : ${kg(current.bestWeight)} contre ${kg(previous.bestWeight)}.`);
  if (repsDelta > 0) messages.push(`${current.repsAtBestWeight} répétitions à ${kg(current.bestWeight)} contre ${previous.repsAtBestWeight} la dernière fois.`);
  else if (repsDelta < 0) messages.push(`${current.repsAtBestWeight} répétitions à ${kg(current.bestWeight)} contre ${previous.repsAtBestWeight} la dernière fois.`);
  const volPct = previous.volume > 0 ? (volumeDelta / previous.volume) * 100 : 0;
  if (Math.abs(volPct) >= 2) messages.push(`Volume ${volumeDelta > 0 ? 'en hausse' : 'en baisse'} de ${Math.abs(Math.round(volPct))} % (${Math.round(current.volume).toLocaleString('fr-FR')} kg).`);

  let kind: Comparison['kind'] = 'stable';
  const score = Math.sign(weightDelta) * 2 + Math.sign(repsDelta) + (Math.abs(volPct) >= 2 ? Math.sign(volumeDelta) : 0) + (e1rmDelta ? Math.sign(e1rmDelta) : 0);
  if (weightDelta > 0 || repsDelta > 0 || score >= 2) kind = 'progress';
  else if (score <= -2) kind = 'regress';
  if (!messages.length) messages.push('Performance identique à la dernière séance.');
  return { kind, weightDelta, repsDelta, volumeDelta, e1rmDelta, messages };
}

export type RecordType = 'weight' | 'e1rm' | 'reps' | 'setVolume' | 'sessionVolume';

export const RECORD_LABELS: Record<RecordType, string> = {
  weight: 'Charge maximale',
  e1rm: '1RM estimé',
  reps: 'Répétitions à charge égale ou supérieure',
  setVolume: 'Meilleure série (charge × reps)',
  sessionVolume: 'Meilleur volume de séance',
};

export interface RecordEvent {
  type: RecordType;
  exerciseId: string;
  sessionId: string;
  date: string;
  value: number;
  previous: number | null;
  weightKg: number;
  reps: number;
}

/**
 * Détecte les records battus par une série par rapport à l'historique (séries antérieures uniquement).
 * Aucun record n'est attribué lors de la toute première série d'un exercice (pas de référence).
 */
export function recordsBrokenBySet(
  history: PerfSet[],
  set: PerfSet,
): { type: Exclude<RecordType, 'sessionVolume'>; value: number; previous: number }[] {
  if (!history.length || set.reps <= 0) return [];
  const out: { type: Exclude<RecordType, 'sessionVolume'>; value: number; previous: number }[] = [];
  const bestWeight = Math.max(...history.map((h) => h.weightKg));
  if (set.weightKg > 0 && set.weightKg > bestWeight) out.push({ type: 'weight', value: set.weightKg, previous: bestWeight });
  const e = epley1RM(set.weightKg, set.reps);
  const prevE = Math.max(0, ...history.map((h) => epley1RM(h.weightKg, h.reps) ?? 0));
  if (e !== null && prevE > 0 && e > prevE + 1e-9) out.push({ type: 'e1rm', value: round(e, 1), previous: round(prevE, 1) });
  // Plus de répétitions qu'auparavant à une charge au moins égale
  const atOrAbove = history.filter((h) => h.weightKg >= set.weightKg);
  if (atOrAbove.length) {
    const prevReps = Math.max(...atOrAbove.map((h) => h.reps));
    if (set.reps > prevReps) out.push({ type: 'reps', value: set.reps, previous: prevReps });
  }
  const vol = set.weightKg * set.reps;
  const prevVol = Math.max(...history.map((h) => h.weightKg * h.reps));
  if (vol > 0 && prevVol > 0 && vol > prevVol) out.push({ type: 'setVolume', value: vol, previous: prevVol });
  return out;
}

/** Tous les records successifs d'un exercice, par ordre chronologique */
export function recordTimeline(exerciseId: string, history: ExercisePerformance[]): RecordEvent[] {
  const events: RecordEvent[] = [];
  const past: PerfSet[] = [];
  let bestSessionVolume = 0;
  for (const perf of history) {
    // Un seul événement par type et par séance : le meilleur
    const best = new Map<RecordType, RecordEvent>();
    const seen: PerfSet[] = [...past];
    for (const s of perf.sets) {
      for (const r of recordsBrokenBySet(seen, s)) {
        const cur = best.get(r.type);
        if (!cur || r.value > cur.value) {
          best.set(r.type, { type: r.type, exerciseId, sessionId: perf.sessionId, date: perf.date, value: r.value, previous: cur?.previous ?? r.previous, weightKg: s.weightKg, reps: s.reps });
        }
      }
      seen.push(s);
    }
    if (past.length && perf.volume > bestSessionVolume) {
      best.set('sessionVolume', { type: 'sessionVolume', exerciseId, sessionId: perf.sessionId, date: perf.date, value: perf.volume, previous: bestSessionVolume, weightKg: perf.bestWeight, reps: perf.repsAtBestWeight });
    }
    bestSessionVolume = Math.max(bestSessionVolume, perf.volume);
    events.push(...best.values());
    past.push(...perf.sets);
  }
  return events;
}

export interface ExerciseRecords {
  bestWeight: { value: number; reps: number; date: string } | null;
  bestE1rm: { value: number; weightKg: number; reps: number; date: string } | null;
  maxReps: { value: number; weightKg: number; date: string } | null;
  bestSetVolume: { value: number; weightKg: number; reps: number; date: string } | null;
  bestSessionVolume: { value: number; date: string } | null;
  totalVolume: number;
  sessions: number;
}

export function exerciseRecords(history: ExercisePerformance[]): ExerciseRecords {
  const r: ExerciseRecords = { bestWeight: null, bestE1rm: null, maxReps: null, bestSetVolume: null, bestSessionVolume: null, totalVolume: 0, sessions: history.length };
  for (const p of history) {
    r.totalVolume += p.volume;
    if (!r.bestSessionVolume || p.volume > r.bestSessionVolume.value) r.bestSessionVolume = { value: p.volume, date: p.date };
    for (const s of p.sets) {
      if (s.weightKg > 0 && (!r.bestWeight || s.weightKg > r.bestWeight.value || (s.weightKg === r.bestWeight.value && s.reps > r.bestWeight.reps)))
        r.bestWeight = { value: s.weightKg, reps: s.reps, date: p.date };
      const e = epley1RM(s.weightKg, s.reps);
      if (e !== null && (!r.bestE1rm || e > r.bestE1rm.value)) r.bestE1rm = { value: round(e, 1), weightKg: s.weightKg, reps: s.reps, date: p.date };
      if (!r.maxReps || s.reps > r.maxReps.value) r.maxReps = { value: s.reps, weightKg: s.weightKg, date: p.date };
      const v = s.weightKg * s.reps;
      if (v > 0 && (!r.bestSetVolume || v > r.bestSetVolume.value)) r.bestSetVolume = { value: v, weightKg: s.weightKg, reps: s.reps, date: p.date };
    }
  }
  return r;
}

export interface ProgressionSuggestion {
  currentWeightKg: number;
  suggestedWeightKg: number;
  reason: string;
}

/**
 * Surcharge progressive (double progression) : lorsque toutes les séries de travail prévues
 * atteignent le haut de la fourchette à la même charge, on SUGGÈRE une légère hausse.
 * La charge n'est jamais modifiée sans validation de l'utilisateur.
 */
export function progressionSuggestion(
  last: ExercisePerformance | null | undefined,
  target: { sets: number; repMin: number; repMax: number },
  incrementKg: number,
): ProgressionSuggestion | null {
  if (!last || target.repMax <= 0 || target.sets <= 0) return null;
  const top = last.sets.filter((s) => s.weightKg === last.bestWeight);
  if (top.length < target.sets || last.bestWeight <= 0) return null;
  if (!top.slice(0, target.sets).every((s) => s.reps >= target.repMax)) return null;
  const inc = incrementKg > 0 ? incrementKg : 2.5;
  return {
    currentWeightKg: last.bestWeight,
    suggestedWeightKg: round(last.bestWeight + inc, 2),
    reason: `Tes ${target.sets} séries ont atteint ${target.repMax} répétitions à ${kg(last.bestWeight)} : tu peux essayer ${kg(last.bestWeight + inc)} en visant ${target.repMin} répétitions ou plus, si l'exécution reste propre.`,
  };
}

/** Stagnation : aucune amélioration du 1RM estimé ni du volume sur les `n` dernières séances */
export function isStagnating(history: ExercisePerformance[], n = 3): boolean {
  if (history.length < n + 1) return false;
  const before = history.slice(0, history.length - n);
  const recent = history.slice(-n);
  const bestBefore = Math.max(...before.map((p) => p.bestE1rm ?? 0));
  const bestRecent = Math.max(...recent.map((p) => p.bestE1rm ?? 0));
  const volBefore = Math.max(...before.slice(-n).map((p) => p.volume));
  const volRecent = Math.max(...recent.map((p) => p.volume));
  const repsBefore = Math.max(...before.map((p) => p.maxReps));
  const repsRecent = Math.max(...recent.map((p) => p.maxReps));
  return bestRecent <= bestBefore && volRecent <= volBefore && (bestBefore > 0 || repsRecent <= repsBefore);
}

/** Évolution du 1RM estimé sur une période : pente (kg/semaine) et variation en % */
export function strengthTrend(history: ExercisePerformance[], fromDate: string): { changePct: number; slopePerWeek: number; first: number; last: number; points: number } | null {
  const pts = history.filter((p) => p.date >= fromDate && p.bestE1rm !== null);
  if (pts.length < 2) return null;
  const t0 = new Date(pts[0].startedAt).getTime();
  const reg = linearRegression(pts.map((p) => ({ x: (new Date(p.startedAt).getTime() - t0) / (7 * 86_400_000), y: p.bestE1rm! })));
  const first = pts[0].bestE1rm!;
  const last = pts[pts.length - 1].bestE1rm!;
  return { changePct: ((last - first) / first) * 100, slopePerWeek: reg?.slope ?? 0, first, last, points: pts.length };
}

export interface MuscleVolumeRow {
  muscle: MuscleGroup;
  direct: number;
  secondary: number;
  /** Séries équivalentes : directes + 0,5 × secondaires */
  weighted: number;
}

export const ALL_MUSCLES: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs'];

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Pectoraux',
  back: 'Dos',
  shoulders: 'Épaules',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quadriceps',
  hamstrings: 'Ischio-jambiers',
  glutes: 'Fessiers',
  calves: 'Mollets',
  abs: 'Abdominaux',
};

/** Séries par groupe musculaire : 1 pour le muscle principal, 0,5 pour chaque muscle secondaire */
export function muscleVolume(sets: WorkoutSet[], exercisesById: Map<string, Exercise>): MuscleVolumeRow[] {
  const rows = new Map<MuscleGroup, MuscleVolumeRow>(ALL_MUSCLES.map((m) => [m, { muscle: m, direct: 0, secondary: 0, weighted: 0 }]));
  for (const s of workingSets(sets)) {
    const ex = exercisesById.get(s.exerciseId);
    if (!ex) continue;
    rows.get(ex.primaryMuscle)!.direct += 1;
    for (const m of ex.secondaryMuscles) if (m !== ex.primaryMuscle) rows.get(m)!.secondary += 1;
  }
  for (const r of rows.values()) r.weighted = r.direct + r.secondary * 0.5;
  return [...rows.values()];
}

export function sessionDurationMs(s: Pick<WorkoutSession, 'startedAt' | 'endedAt'>): number {
  if (!s.endedAt) return 0;
  return Math.max(0, new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime());
}
