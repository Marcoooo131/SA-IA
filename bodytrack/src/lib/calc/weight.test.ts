import { describe, expect, it } from 'vitest';
import { averageChange, cleanLogs, movingAverage, weightGoalProgress, weightSeries, weightSlope } from './weight';

const log = (date: string, weightKg: number) => ({ date, weightKg });

describe('moyenne mobile', () => {
  const logs = [log('2026-10-01', 73), log('2026-10-02', 73.4), log('2026-10-04', 72.8), log('2026-10-08', 74)];
  it('moyenne des pesées dans la fenêtre de 7 jours', () => {
    expect(movingAverage(logs, '2026-10-07')).toBeCloseTo((73 + 73.4 + 72.8) / 3, 6);
    // le 8 : fenêtre 2 → 8
    expect(movingAverage(logs, '2026-10-08')).toBeCloseTo((73.4 + 72.8 + 74) / 3, 6);
  });
  it('aucune pesée → null', () => {
    expect(movingAverage(logs, '2026-09-01')).toBeNull();
  });
  it('plusieurs pesées le même jour : moyenne, pesées supprimées ignorées', () => {
    const c = cleanLogs([log('2026-10-01', 73), log('2026-10-01', 74), { date: '2026-10-02', weightKg: 99, deletedAt: 'x' }]);
    expect(c).toEqual([{ date: '2026-10-01', weightKg: 73.5 }]);
  });
  it('série quotidienne identique au calcul direct', () => {
    const s = weightSeries(logs);
    expect(s).toHaveLength(8);
    for (const p of s) expect(p.avg7 ?? null).toBeCloseTo(movingAverage(logs, p.date) ?? NaN, 6);
  });
});

describe('tendance', () => {
  const logs = Array.from({ length: 21 }, (_, i) => log(`2026-10-${String(i + 1).padStart(2, '0')}`, 70 + i * 0.05));
  it('pente en kg/jour', () => {
    expect(weightSlope(logs, '2026-10-21', 21)).toBeCloseTo(0.05, 6);
  });
  it('variation de la moyenne sur 7 jours', () => {
    expect(averageChange(logs, '2026-10-21', 7)).toBeCloseTo(0.35, 6);
  });
  it('données insuffisantes → null', () => {
    expect(weightSlope(logs.slice(0, 3), '2026-10-03', 21)).toBeNull();
  });
  it('progression vers l\'objectif bornée', () => {
    expect(weightGoalProgress(72, 76, 74)).toBe(50);
    expect(weightGoalProgress(80, 75, 82)).toBe(0);
    expect(weightGoalProgress(80, 75, 74)).toBe(100);
  });
});
