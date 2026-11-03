import { describe, expect, it } from 'vitest';
import { daysToTarget, equilibriumWeight, naiveLinear, simulate, simulateTrajectory } from './simulation';

describe('simulateur de poids', () => {
  it('apport = maintien → poids stable', () => {
    const pts = simulate({ startWeightKg: 73, maintenanceKcal: 2700, intakeKcal: 2700, days: 365 });
    expect(pts[365].central).toBeCloseTo(73, 5);
  });

  it('surplus : prise de poids, mais moins que la projection linéaire', () => {
    const pts = simulate({ startWeightKg: 73, maintenanceKcal: 2700, intakeKcal: 3000, days: 365 });
    const linear = naiveLinear(73, 300, 365);
    expect(pts[30].central).toBeGreaterThan(73);
    expect(pts[365].central).toBeLessThan(linear);
    expect(pts[365].central).toBeGreaterThan(73 + 5);
  });

  it('la dépense augmente avec le poids', () => {
    const t = simulateTrajectory(73, 2700, 3000, 180, 6600, 1.55);
    expect(t.tdee[180]).toBeGreaterThan(2700);
    expect(t.tdee[180]).toBeLessThan(3000);
  });

  it('converge vers le poids d\'équilibre', () => {
    const eq = equilibriumWeight(73, 2700, 3000, 1.55);
    const t = simulateTrajectory(73, 2700, 3000, 20000, 6600, 1.55);
    expect(t.weights[20000]).toBeCloseTo(eq, 2);
  });

  it('fourchette : low ≤ central ≤ high et elle s\'élargit avec le temps', () => {
    const pts = simulate({ startWeightKg: 73, maintenanceKcal: 2700, intakeKcal: 3100, days: 365 });
    for (const p of pts) {
      expect(p.low).toBeLessThanOrEqual(p.central);
      expect(p.high).toBeGreaterThanOrEqual(p.central);
    }
    expect(pts[365].high - pts[365].low).toBeGreaterThan(pts[30].high - pts[30].low);
  });

  it('déficit : perte de poids et délai pour atteindre la cible', () => {
    const pts = simulate({ startWeightKg: 85, maintenanceKcal: 2800, intakeKcal: 2300, days: 365 });
    expect(pts[91].central).toBeLessThan(85);
    const d = daysToTarget(pts, 85, 80);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(60);
    expect(daysToTarget(pts, 85, 40)).toBeNull();
  });
});
