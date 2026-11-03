import { describe, expect, it } from 'vitest';
import { macroKcalMismatch, nutrientsFor, remaining, roundNutrients, sumItems } from './nutrition';

const rice = { kcal100: 130, protein100: 2.7, carbs100: 28.2, fat100: 0.3 };
const chicken = { kcal100: 165, protein100: 31, carbs100: 0, fat100: 3.6 };

describe('nutriments d\'une quantité', () => {
  it('règle de trois sur 100 g', () => {
    const n = nutrientsFor(rice, 250);
    expect(n.kcal).toBeCloseTo(325);
    expect(n.carbs).toBeCloseTo(70.5);
  });
  it('quantité invalide → 0', () => {
    expect(nutrientsFor(rice, -10).kcal).toBe(0);
    expect(nutrientsFor(rice, NaN).kcal).toBe(0);
  });
});

describe('totaux d\'un repas et d\'une journée', () => {
  it('additionne avant d\'arrondir', () => {
    const t = sumItems([
      { ...rice, quantity: 250 },
      { ...chicken, quantity: 150 },
    ]);
    expect(roundNutrients(t)).toEqual({ kcal: 573, protein: 53.3, carbs: 70.5, fat: 6.2 });
  });
  it('journée vide → zéro', () => {
    expect(sumItems([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });
  it('quantités restantes', () => {
    const r = remaining({ kcal: 2700, protein: 145, carbs: 310, fat: 75 }, { calories: 3000, proteinG: 180, carbsG: 350, fatG: 85 });
    expect(r).toEqual({ kcal: 300, protein: 35, carbs: 40, fat: 10 });
  });
});

describe('contrôle de cohérence', () => {
  it('détecte des valeurs incohérentes', () => {
    expect(macroKcalMismatch(chicken)).toBeLessThan(0.1);
    expect(macroKcalMismatch({ kcal100: 100, protein100: 50, carbs100: 50, fat100: 10 })).toBeGreaterThan(1);
  });
});
