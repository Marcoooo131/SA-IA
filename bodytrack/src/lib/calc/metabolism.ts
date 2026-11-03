import type { ActivityLevel, GoalType, Sex } from '../types';
import { clamp, round } from '../format';

export const ACTIVITY_LEVELS: { value: ActivityLevel; label: string; factor: number; hint: string }[] = [
  { value: 'sedentary', label: 'Sédentaire', factor: 1.2, hint: 'Travail assis, peu de marche, pas ou peu de sport' },
  { value: 'light', label: 'Légèrement actif', factor: 1.375, hint: '1 à 3 séances par semaine ou marche régulière' },
  { value: 'moderate', label: 'Modérément actif', factor: 1.55, hint: '3 à 5 séances par semaine' },
  { value: 'active', label: 'Très actif', factor: 1.725, hint: '6 à 7 séances par semaine ou métier physique' },
  { value: 'very_active', label: 'Extrêmement actif', factor: 1.9, hint: 'Entraînement biquotidien ou travail très physique' },
];

export function activityFactor(level: ActivityLevel): number {
  return ACTIVITY_LEVELS.find((a) => a.value === level)?.factor ?? 1.55;
}

/** Niveau d'activité suggéré à partir du nombre d'entraînements hebdomadaires */
export function suggestActivityLevel(trainingDaysPerWeek: number): ActivityLevel {
  if (trainingDaysPerWeek <= 0) return 'sedentary';
  if (trainingDaysPerWeek <= 2) return 'light';
  if (trainingDaysPerWeek <= 5) return 'moderate';
  return 'active';
}

/**
 * Métabolisme de base — équation de Mifflin-St Jeor (1990).
 * Homme : 10 × poids + 6,25 × taille − 5 × âge + 5
 * Femme : 10 × poids + 6,25 × taille − 5 × âge − 161
 */
export function bmrMifflinStJeor(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  if (!(weightKg > 0) || !(heightCm > 0) || !(age > 0)) return NaN;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

/** Dépense énergétique journalière estimée (TDEE) = BMR × facteur d'activité */
export function tdee(bmr: number, level: ActivityLevel): number {
  return bmr * activityFactor(level);
}

/** Plancher calorique de sécurité : jamais de cible sous le métabolisme de base ni sous un minimum absolu */
export function calorieFloor(sex: Sex, bmr: number): number {
  return Math.max(bmr, sex === 'male' ? 1500 : 1200);
}

export const DEFAULT_ADJUSTMENT: Record<GoalType, number> = { bulk: 250, maintain: 0, cut: -400 };
export const ADJUSTMENT_LIMITS: Record<GoalType, [number, number]> = {
  bulk: [100, 500],
  maintain: [-100, 100],
  cut: [-750, -200],
};

/** Ajustement calorique borné pour éviter les objectifs extrêmes */
export function clampAdjustment(goal: GoalType, adjustment: number): number {
  const [min, max] = ADJUSTMENT_LIMITS[goal];
  return clamp(adjustment, min, max);
}

export function targetCalories(goal: GoalType, maintenance: number, adjustment: number, sex: Sex, bmr: number): number {
  const adj = clampAdjustment(goal, adjustment);
  const raw = maintenance + adj;
  const floor = goal === 'cut' ? calorieFloor(sex, bmr) : 0;
  return Math.round(Math.max(raw, floor) / 10) * 10;
}

/** Variation de poids hebdomadaire approximative associée à un écart calorique (repère de départ seulement) */
export function approxWeeklyChangeKg(dailyAdjustmentKcal: number): number {
  return round((dailyAdjustmentKcal * 7) / 7700, 2);
}

export const DEFAULT_PROTEIN_PER_KG: Record<GoalType, number> = { bulk: 1.8, maintain: 1.8, cut: 2.0 };
export const DEFAULT_FAT_PER_KG = 0.9;

export interface MacroTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * Répartition des macronutriments : protéines et lipides en g/kg, glucides = reste des calories.
 * 1 g de protéines ou de glucides = 4 kcal ; 1 g de lipides = 9 kcal.
 */
export function macroSplit(calories: number, weightKg: number, proteinPerKg: number, fatPerKg: number): MacroTargets {
  const proteinG = Math.round(clamp(proteinPerKg, 1.2, 2.5) * weightKg);
  let fatG = Math.round(clamp(fatPerKg, 0.6, 1.5) * weightKg);
  let remaining = calories - proteinG * 4 - fatG * 9;
  if (remaining < 0) {
    // Calories trop faibles : on réduit les lipides jusqu'à 0,6 g/kg avant de laisser les glucides à 0
    const minFat = Math.round(0.6 * weightKg);
    const reducible = Math.max(0, fatG - minFat);
    const reduce = Math.min(reducible, Math.ceil(-remaining / 9));
    fatG -= reduce;
    remaining = calories - proteinG * 4 - fatG * 9;
  }
  const carbsG = Math.max(0, Math.round(remaining / 4));
  return { calories: Math.round(calories), proteinG, carbsG, fatG };
}

/** Calories correspondant à des macros (pour vérifier la cohérence d'une saisie manuelle) */
export function caloriesFromMacros(proteinG: number, carbsG: number, fatG: number): number {
  return Math.round(proteinG * 4 + carbsG * 4 + fatG * 9);
}

export interface MetabolicInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: GoalType;
  adjustment?: number;
  proteinPerKg?: number;
  fatPerKg?: number;
}

export interface MetabolicResult extends MacroTargets {
  bmr: number;
  tdee: number;
  maintenance: number;
  adjustment: number;
  weeklyChangeKg: number;
  floorApplied: boolean;
  proteinPerKg: number;
  fatPerKg: number;
}

export function computeMetabolicPlan(input: MetabolicInput): MetabolicResult {
  const bmr = bmrMifflinStJeor(input.sex, input.weightKg, input.heightCm, input.age);
  const t = tdee(bmr, input.activityLevel);
  const maintenance = Math.round(t / 10) * 10;
  const adjustment = clampAdjustment(input.goal, input.adjustment ?? DEFAULT_ADJUSTMENT[input.goal]);
  const calories = targetCalories(input.goal, maintenance, adjustment, input.sex, bmr);
  const proteinPerKg = input.proteinPerKg ?? DEFAULT_PROTEIN_PER_KG[input.goal];
  const fatPerKg = input.fatPerKg ?? DEFAULT_FAT_PER_KG;
  const macros = macroSplit(calories, input.weightKg, proteinPerKg, fatPerKg);
  return {
    ...macros,
    bmr: Math.round(bmr),
    tdee: Math.round(t),
    maintenance,
    adjustment,
    weeklyChangeKg: approxWeeklyChangeKg(calories - maintenance),
    floorApplied: calories > maintenance + adjustment,
    proteinPerKg,
    fatPerKg,
  };
}

/**
 * Dépense observée à partir des données réelles :
 * dépense ≈ apport moyen − (pente du poids en kg/jour × 7 700 kcal/kg).
 * Ce n'est qu'une estimation (eau, glycogène et oublis de saisie la faussent).
 */
export function observedTdee(avgIntakeKcal: number, weightSlopeKgPerDay: number, energyDensity = 7700): number {
  return Math.round(avgIntakeKcal - weightSlopeKgPerDay * energyDensity);
}
