import type { ISODate, UserGoal } from '../types';
import type { Ctx } from './context';
import { addDays, dateOf, diffDays, startOfWeek } from '../dates';
import { latestLog, movingAverage, weightSeries } from '../calc/weight';
import { epley1RM, recordTimeline, totalVolume } from '../calc/training';
import { nutritionAverages, sessionsBetween, trackedDates } from './stats';
import { round } from '../format';

export interface GoalProgress {
  current: number | null;
  pct: number;
  achieved: boolean;
  unit: string;
  detail: string;
}

function progressPct(start: number, target: number, current: number | null): number {
  if (current === null) return 0;
  if (target === start) return current === target ? 100 : 0;
  return Math.max(0, Math.min(100, ((current - start) / (target - start)) * 100));
}

export function goalProgress(ctx: Ctx, g: UserGoal, onDate: ISODate): GoalProgress {
  switch (g.type) {
    case 'weight': {
      const cur = movingAverage(ctx.data.weights, onDate, 7) ?? latestLog(ctx.data.weights, onDate)?.weightKg ?? null;
      const pct = progressPct(g.startValue, g.targetValue, cur);
      return { current: cur === null ? null : round(cur, 1), pct, achieved: pct >= 100, unit: 'kg', detail: 'Moyenne des 7 derniers jours' };
    }
    case 'strength': {
      const h = g.exerciseId ? ctx.history(g.exerciseId) : [];
      let cur: number | null = null;
      for (const p of h)
        for (const s of p.sets) {
          const v = g.metric === 'weight' ? s.weightKg : epley1RM(s.weightKg, s.reps);
          if (v && (cur === null || v > cur)) cur = v;
        }
      const pct = progressPct(g.startValue, g.targetValue, cur);
      return { current: cur === null ? null : round(cur, 1), pct, achieved: pct >= 100, unit: 'kg', detail: g.metric === 'weight' ? 'Charge maximale réalisée' : '1RM estimé (Epley)' };
    }
    case 'reps': {
      const h = g.exerciseId ? ctx.history(g.exerciseId) : [];
      const ref = g.referenceWeightKg ?? 0;
      let cur: number | null = null;
      for (const p of h) for (const s of p.sets) if (s.weightKg >= ref && (cur === null || s.reps > cur)) cur = s.reps;
      const pct = progressPct(g.startValue, g.targetValue, cur);
      return { current: cur, pct, achieved: pct >= 100, unit: 'reps', detail: `Meilleure série à ${ref.toLocaleString('fr-FR')} kg ou plus` };
    }
    case 'consistency': {
      // Moyenne de séances par semaine sur les 4 dernières semaines
      const from = addDays(startOfWeek(onDate), -21);
      const n = sessionsBetween(ctx, from, onDate).length;
      const cur = round(n / Math.max(1, (diffDays(from, onDate) + 1) / 7), 1);
      const pct = Math.min(100, (cur / Math.max(0.1, g.targetValue)) * 100);
      return { current: cur, pct, achieved: pct >= 100, unit: 'séances/sem.', detail: 'Moyenne des 4 dernières semaines' };
    }
    case 'nutrition': {
      const n = nutritionAverages(ctx, addDays(onDate, -29), onDate);
      const cur = g.metric === 'protein_days' ? n.proteinOnTargetDays : n.loggedDays;
      const pct = Math.min(100, (cur / Math.max(1, g.targetValue)) * 100);
      return { current: cur, pct, achieved: pct >= 100, unit: 'jours', detail: g.metric === 'protein_days' ? 'Jours avec objectif protéique atteint (30 j)' : 'Jours avec journal saisi (30 j)' };
    }
    case 'measurement': {
      const key = g.metric as keyof (typeof ctx.data.measurements)[number];
      const ms = ctx.data.measurements.filter((m) => m.date <= onDate && typeof m[key] === 'number').sort((a, b) => a.date.localeCompare(b.date));
      const cur = ms.length ? (ms[ms.length - 1][key] as number) : null;
      const pct = progressPct(g.startValue, g.targetValue, cur);
      return { current: cur, pct, achieved: pct >= 100, unit: 'cm', detail: 'Dernière mesure' };
    }
  }
}

export interface AchievementDef {
  key: string;
  title: string;
  description: string;
  icon: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first_session', title: 'Première séance', description: 'Terminer ta première séance', icon: 'dumbbell' },
  { key: 'sessions_10', title: '10 séances', description: 'Terminer 10 séances', icon: 'flame' },
  { key: 'sessions_50', title: '50 séances', description: 'Terminer 50 séances', icon: 'medal' },
  { key: 'sessions_100', title: '100 séances', description: 'Terminer 100 séances', icon: 'crown' },
  { key: 'first_pr', title: 'Premier record', description: 'Battre un record personnel', icon: 'trophy' },
  { key: 'volume_100t', title: '100 tonnes', description: 'Soulever 100 tonnes au total', icon: 'weight' },
  { key: 'nutrition_30', title: '30 jours de nutrition', description: 'Saisir ton alimentation sur 30 jours différents', icon: 'apple' },
  { key: 'first_weigh', title: 'Première pesée', description: 'Enregistrer ton poids', icon: 'scale' },
  { key: 'tracked_7', title: '7 jours suivis', description: 'Suivre 7 jours d\'affilée (repas, séance ou pesée)', icon: 'calendar' },
  { key: 'weight_goal', title: 'Objectif de poids atteint', description: 'Atteindre ton poids objectif (moyenne 7 jours)', icon: 'target' },
];

/** Date à laquelle chaque succès a été obtenu, calculée à partir des données (null si non obtenu) */
export function achievementDates(ctx: Ctx): Record<string, ISODate | null> {
  const sessions = ctx.doneSessions.map((s) => dateOf(s.startedAt));
  const nth = (n: number) => (sessions.length >= n ? sessions[n - 1] : null);
  let firstPr: ISODate | null = null;
  const ids = new Set(ctx.data.sets.map((s) => s.exerciseId));
  for (const id of ids)
    for (const r of recordTimeline(id, ctx.history(id))) if (r.type !== 'sessionVolume' && (!firstPr || r.date < firstPr)) firstPr = r.date;
  let cum = 0;
  let vol100: ISODate | null = null;
  for (const s of ctx.doneSessions) {
    cum += totalVolume(ctx.setsBySession.get(s.id) ?? []);
    if (cum >= 100_000) {
      vol100 = dateOf(s.startedAt);
      break;
    }
  }
  const logged = [...ctx.loggedDates].sort();
  const tracked = [...trackedDates(ctx)].sort();
  let run = 0;
  let tracked7: ISODate | null = null;
  for (let i = 0; i < tracked.length; i++) {
    run = i > 0 && diffDays(tracked[i - 1], tracked[i]) === 1 ? run + 1 : 1;
    if (run >= 7) {
      tracked7 = tracked[i];
      break;
    }
  }
  let weightGoal: ISODate | null = null;
  const p = ctx.data.profile;
  if (p && p.targetWeightKg && p.startWeightKg !== p.targetWeightKg) {
    const up = p.targetWeightKg > p.startWeightKg;
    for (const pt of weightSeries(ctx.data.weights)) {
      if (pt.avg7 !== null && pt.weight !== null && (up ? pt.avg7 >= p.targetWeightKg : pt.avg7 <= p.targetWeightKg)) {
        weightGoal = pt.date;
        break;
      }
    }
  }
  const weights = [...ctx.data.weights].sort((a, b) => a.date.localeCompare(b.date));
  return {
    first_session: nth(1),
    sessions_10: nth(10),
    sessions_50: nth(50),
    sessions_100: nth(100),
    first_pr: firstPr,
    volume_100t: vol100,
    nutrition_30: logged.length >= 30 ? logged[29] : null,
    first_weigh: weights[0]?.date ?? null,
    tracked_7: tracked7,
    weight_goal: weightGoal,
  };
}

/**
 * Séries de jours suivis, bienveillantes : un jour sans saisie isolé ne casse pas la série
 * (jour de repos), seuls deux jours consécutifs sans saisie la terminent. Aujourd'hui non
 * encore saisi ne compte pas comme un oubli.
 */
export function trackingStreak(ctx: Ctx, onDate: ISODate): { current: number; best: number; weeksActive: number } {
  const tracked = trackedDates(ctx);
  let current = 0;
  let gap = 0;
  let d = tracked.has(onDate) ? onDate : addDays(onDate, -1);
  for (let i = 0; i < 3650; i++) {
    if (tracked.has(d)) {
      current++;
      gap = 0;
    } else {
      gap++;
      if (gap >= 2) break;
    }
    d = addDays(d, -1);
  }
  const sorted = [...tracked].sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && diffDays(sorted[i - 1], sorted[i]) <= 2 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  // Semaines consécutives avec au moins une séance (la semaine en cours ne casse pas la série)
  let weeksActive = 0;
  let ws = startOfWeek(onDate);
  const hasSession = (w: ISODate) => sessionsBetween(ctx, w, addDays(w, 6)).length > 0;
  if (!hasSession(ws)) ws = addDays(ws, -7);
  while (hasSession(ws) && weeksActive < 520) {
    weeksActive++;
    ws = addDays(ws, -7);
  }
  return { current, best: Math.max(best, current), weeksActive };
}
