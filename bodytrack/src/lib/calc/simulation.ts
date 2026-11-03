import { round } from '../format';

/**
 * Simulateur de variation de poids — modèle dynamique simplifié.
 *
 * Plutôt qu'une simple règle « écart × jours ÷ 7 700 », la dépense énergétique évolue avec le poids :
 *   dépense(t) = maintien initial + k × (poids(t) − poids initial)
 * avec k ≈ 10 kcal/kg (terme « poids » de Mifflin-St Jeor) × facteur d'activité.
 * Chaque jour : Δpoids = (apport − dépense(t)) ÷ densité énergétique.
 * Le poids tend donc vers un équilibre au lieu de varier indéfiniment.
 *
 * Fourchette : on combine une incertitude sur le maintien (± marge) et sur la densité énergétique
 * des tissus gagnés ou perdus (environ 5 500 à 7 700 kcal/kg selon la part de muscle et de graisse).
 * Les fluctuations d'eau, de glycogène et de contenu digestif ne sont pas modélisées.
 */
export interface SimulationInput {
  startWeightKg: number;
  maintenanceKcal: number;
  intakeKcal: number;
  days: number;
  activityFactor?: number;
  /** Incertitude sur le maintien, en kcal/jour (défaut : 5 % du maintien) */
  maintenanceUncertainty?: number;
  energyDensityLow?: number;
  energyDensityHigh?: number;
  energyDensityCentral?: number;
}

export interface SimulationPoint {
  day: number;
  central: number;
  low: number;
  high: number;
  tdee: number;
}

export function simulateTrajectory(
  startWeightKg: number,
  maintenanceKcal: number,
  intakeKcal: number,
  days: number,
  density: number,
  activityFactor = 1.55,
): { weights: number[]; tdee: number[] } {
  const k = 10 * activityFactor;
  const weights = [startWeightKg];
  const tdeeArr = [maintenanceKcal];
  let w = startWeightKg;
  for (let d = 1; d <= days; d++) {
    const expenditure = maintenanceKcal + k * (w - startWeightKg);
    w = w + (intakeKcal - expenditure) / density;
    weights.push(w);
    tdeeArr.push(maintenanceKcal + k * (w - startWeightKg));
  }
  return { weights, tdee: tdeeArr };
}

export function simulate(input: SimulationInput): SimulationPoint[] {
  const af = input.activityFactor ?? 1.55;
  const u = input.maintenanceUncertainty ?? Math.round(input.maintenanceKcal * 0.05);
  const dLow = input.energyDensityLow ?? 5500;
  const dHigh = input.energyDensityHigh ?? 7700;
  const dMid = input.energyDensityCentral ?? 6600;
  const days = Math.max(1, Math.round(input.days));
  const central = simulateTrajectory(input.startWeightKg, input.maintenanceKcal, input.intakeKcal, days, dMid, af);
  const variants = [
    simulateTrajectory(input.startWeightKg, input.maintenanceKcal - u, input.intakeKcal, days, dLow, af).weights,
    simulateTrajectory(input.startWeightKg, input.maintenanceKcal - u, input.intakeKcal, days, dHigh, af).weights,
    simulateTrajectory(input.startWeightKg, input.maintenanceKcal + u, input.intakeKcal, days, dLow, af).weights,
    simulateTrajectory(input.startWeightKg, input.maintenanceKcal + u, input.intakeKcal, days, dHigh, af).weights,
  ];
  const out: SimulationPoint[] = [];
  for (let d = 0; d <= days; d++) {
    const vals = variants.map((v) => v[d]);
    out.push({
      day: d,
      central: round(central.weights[d], 2),
      low: round(Math.min(...vals, central.weights[d]), 2),
      high: round(Math.max(...vals, central.weights[d]), 2),
      tdee: Math.round(central.tdee[d]),
    });
  }
  return out;
}

/** Poids d'équilibre théorique vers lequel tend le modèle */
export function equilibriumWeight(startWeightKg: number, maintenanceKcal: number, intakeKcal: number, activityFactor = 1.55): number {
  return startWeightKg + (intakeKcal - maintenanceKcal) / (10 * activityFactor);
}

/** Jours estimés pour atteindre un poids cible (trajectoire centrale), null si jamais atteint dans l'horizon */
export function daysToTarget(points: SimulationPoint[], startWeightKg: number, targetKg: number): number | null {
  const up = targetKg >= startWeightKg;
  for (const p of points) if (up ? p.central >= targetKg : p.central <= targetKg) return p.day;
  return null;
}

/** Projection naïve linéaire (écart × jours ÷ 7 700), affichée uniquement pour comparaison */
export function naiveLinear(startWeightKg: number, dailyDelta: number, days: number): number {
  return startWeightKg + (dailyDelta * days) / 7700;
}

export const HORIZONS = [
  { days: 7, label: '1 semaine' },
  { days: 30, label: '1 mois' },
  { days: 91, label: '3 mois' },
  { days: 182, label: '6 mois' },
  { days: 365, label: '12 mois' },
];
