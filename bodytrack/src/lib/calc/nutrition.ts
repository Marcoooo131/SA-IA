import type { MealItem, MealType } from '../types';
import { round } from '../format';

export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Petit-déjeuner' },
  { value: 'lunch', label: 'Déjeuner' },
  { value: 'snack', label: 'Collation' },
  { value: 'dinner', label: 'Dîner' },
];

export const mealLabel = (t: MealType) => MEAL_TYPES.find((m) => m.value === t)?.label ?? t;

type Per100 = { kcal100: number; protein100: number; carbs100: number; fat100: number };

const safe = (n: number | null | undefined) => (Number.isFinite(n as number) && (n as number) > 0 ? (n as number) : 0);

/** Valeurs d'une quantité donnée d'un aliment (valeurs de référence pour 100 g ou 100 ml) */
export function nutrientsFor(per100: Per100, quantity: number): Nutrients {
  const q = safe(quantity) / 100;
  return {
    kcal: safe(per100.kcal100) * q,
    protein: safe(per100.protein100) * q,
    carbs: safe(per100.carbs100) * q,
    fat: safe(per100.fat100) * q,
  };
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat };
}

export function sumItems(items: Pick<MealItem, 'quantity' | keyof Per100>[]): Nutrients {
  return items.reduce((acc, it) => addNutrients(acc, nutrientsFor(it, it.quantity)), { ...ZERO });
}

/** Arrondi d'affichage : kcal à l'unité, macros à 0,1 g (les totaux sont calculés avant arrondi) */
export function roundNutrients(n: Nutrients): Nutrients {
  return { kcal: Math.round(n.kcal), protein: round(n.protein, 1), carbs: round(n.carbs, 1), fat: round(n.fat, 1) };
}

export interface Remaining {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function remaining(consumed: Nutrients, target: { calories: number; proteinG: number; carbsG: number; fatG: number }): Remaining {
  return {
    kcal: Math.round(target.calories - consumed.kcal),
    protein: round(target.proteinG - consumed.protein, 1),
    carbs: round(target.carbsG - consumed.carbs, 1),
    fat: round(target.fatG - consumed.fat, 1),
  };
}

/** Écart entre les calories déclarées et celles calculées à partir des macros (contrôle de saisie) */
export function macroKcalMismatch(per100: Per100): number {
  const fromMacros = per100.protein100 * 4 + per100.carbs100 * 4 + per100.fat100 * 9;
  if (per100.kcal100 <= 0) return fromMacros > 0 ? 1 : 0;
  return Math.abs(fromMacros - per100.kcal100) / per100.kcal100;
}
