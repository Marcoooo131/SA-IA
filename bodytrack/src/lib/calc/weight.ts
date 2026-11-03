import type { ISODate, WeightLog } from '../types';
import { addDays, diffDays } from '../dates';
import { linearRegression, mean } from '../format';

type Log = Pick<WeightLog, 'date' | 'weightKg'> & { deletedAt?: string | null };

/** Pesées valides, une par jour (moyenne si plusieurs), triées par date */
export function cleanLogs(logs: Log[]): { date: ISODate; weightKg: number }[] {
  const byDate = new Map<string, number[]>();
  for (const l of logs) {
    if (l.deletedAt || !(l.weightKg > 0)) continue;
    const arr = byDate.get(l.date) ?? [];
    arr.push(l.weightKg);
    byDate.set(l.date, arr);
  }
  return [...byDate.entries()]
    .map(([date, ws]) => ({ date, weightKg: ws.reduce((a, b) => a + b, 0) / ws.length }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Moyenne mobile : moyenne des pesées des `windowDays` derniers jours calendaires (jour inclus).
 * Les jours sans pesée sont ignorés (pas d'interpolation) ; null si aucune pesée dans la fenêtre.
 */
export function movingAverage(logs: Log[], date: ISODate, windowDays = 7): number | null {
  const from = addDays(date, -(windowDays - 1));
  return mean(cleanLogs(logs).filter((l) => l.date >= from && l.date <= date).map((l) => l.weightKg));
}

export interface WeightPoint {
  date: ISODate;
  weight: number | null;
  avg7: number | null;
}

/** Série quotidienne pour les graphiques (poids du jour + moyenne mobile 7 jours) */
export function weightSeries(logs: Log[], from?: ISODate, to?: ISODate): WeightPoint[] {
  const clean = cleanLogs(logs);
  if (!clean.length) return [];
  const start = from ?? clean[0].date;
  const end = to ?? clean[clean.length - 1].date;
  const byDate = new Map(clean.map((l) => [l.date, l.weightKg]));
  const out: WeightPoint[] = [];
  // Fenêtre glissante incrémentale (O(n))
  const windowVals: { date: string; w: number }[] = clean.filter((l) => l.date >= addDays(start, -6) && l.date < start).map((l) => ({ date: l.date, w: l.weightKg }));
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const w = byDate.get(d);
    if (w !== undefined) windowVals.push({ date: d, w });
    const min = addDays(d, -6);
    while (windowVals.length && windowVals[0].date < min) windowVals.shift();
    out.push({ date: d, weight: w ?? null, avg7: windowVals.length ? windowVals.reduce((a, b) => a + b.w, 0) / windowVals.length : null });
  }
  return out;
}

/** Variation de la moyenne 7 jours entre `date - days` et `date` */
export function averageChange(logs: Log[], date: ISODate, days: number): number | null {
  const now = movingAverage(logs, date, 7);
  const before = movingAverage(logs, addDays(date, -days), 7);
  if (now === null || before === null) return null;
  return now - before;
}

/**
 * Pente du poids (kg/jour) par régression linéaire sur les `days` derniers jours.
 * Nécessite au moins 4 pesées couvrant au moins 7 jours.
 */
export function weightSlope(logs: Log[], date: ISODate, days: number): number | null {
  const from = addDays(date, -(days - 1));
  const pts = cleanLogs(logs).filter((l) => l.date >= from && l.date <= date);
  if (pts.length < 4 || diffDays(pts[0].date, pts[pts.length - 1].date) < 7) return null;
  const reg = linearRegression(pts.map((p) => ({ x: diffDays(from, p.date), y: p.weightKg })));
  return reg ? reg.slope : null;
}

export function latestLog(logs: Log[], onOrBefore?: ISODate): { date: ISODate; weightKg: number } | null {
  const clean = cleanLogs(logs).filter((l) => !onOrBefore || l.date <= onOrBefore);
  return clean.length ? clean[clean.length - 1] : null;
}

/** Progression vers le poids objectif (0 à 100 %), à partir de la moyenne 7 jours */
export function weightGoalProgress(start: number, target: number, current: number | null): number {
  if (current === null || start === target) return current === target ? 100 : 0;
  const p = ((current - start) / (target - start)) * 100;
  return Math.max(0, Math.min(100, p));
}
