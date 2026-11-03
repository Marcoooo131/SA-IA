import { describe, expect, it } from 'vitest';
import { bmrMifflinStJeor, caloriesFromMacros, computeMetabolicPlan, macroSplit, observedTdee, targetCalories, tdee } from './metabolism';

describe('Mifflin-St Jeor', () => {
  it('homme : 10×73 + 6,25×178 − 5×28 + 5 = 1707,5', () => {
    expect(bmrMifflinStJeor('male', 73, 178, 28)).toBeCloseTo(1707.5, 5);
  });
  it('femme : 10×60 + 6,25×165 − 5×30 − 161 = 1320,25', () => {
    expect(bmrMifflinStJeor('female', 60, 165, 30)).toBeCloseTo(1320.25, 5);
  });
  it('valeurs manquantes ou invalides → NaN', () => {
    expect(bmrMifflinStJeor('male', 0, 178, 28)).toBeNaN();
    expect(bmrMifflinStJeor('male', 70, NaN, 28)).toBeNaN();
  });
});

describe('TDEE', () => {
  it('applique le facteur d\'activité', () => {
    expect(tdee(1700, 'sedentary')).toBeCloseTo(2040);
    expect(tdee(1700, 'moderate')).toBeCloseTo(2635);
    expect(tdee(1700, 'very_active')).toBeCloseTo(3230);
  });
});

describe('calories cibles', () => {
  it('surplus borné à 500 kcal en prise de masse', () => {
    expect(targetCalories('bulk', 2700, 1200, 'male', 1700)).toBe(3200);
  });
  it('déficit borné à 750 kcal et jamais sous le métabolisme de base', () => {
    expect(targetCalories('cut', 2700, -2000, 'male', 1700)).toBe(1950);
    expect(targetCalories('cut', 1800, -700, 'female', 1400)).toBe(1400);
  });
  it('maintien proche de la dépense', () => {
    expect(targetCalories('maintain', 2700, 0, 'male', 1700)).toBe(2700);
  });
});

describe('répartition des macronutriments', () => {
  it('protéines et lipides en g/kg, glucides = reste', () => {
    const m = macroSplit(3000, 75, 1.8, 0.9);
    expect(m.proteinG).toBe(135);
    expect(m.fatG).toBe(68);
    // 3000 − 135×4 − 68×9 = 1848 → 462 g
    expect(m.carbsG).toBe(462);
    expect(Math.abs(caloriesFromMacros(m.proteinG, m.carbsG, m.fatG) - 3000)).toBeLessThanOrEqual(4);
  });
  it('calories très basses : glucides jamais négatifs', () => {
    const m = macroSplit(900, 100, 2.2, 1);
    expect(m.carbsG).toBeGreaterThanOrEqual(0);
    expect(m.fatG).toBeGreaterThanOrEqual(60);
  });
});

describe('plan métabolique complet', () => {
  it('cohérent pour une prise de masse', () => {
    const p = computeMetabolicPlan({ sex: 'male', age: 28, heightCm: 178, weightKg: 73, activityLevel: 'moderate', goal: 'bulk' });
    expect(p.bmr).toBe(1708);
    expect(p.tdee).toBe(2647);
    expect(p.maintenance).toBe(2650);
    expect(p.calories).toBe(2900);
    expect(p.weeklyChangeKg).toBeCloseTo(0.23, 2);
  });
});

describe('dépense observée', () => {
  it('poids stable → dépense = apport', () => {
    expect(observedTdee(2800, 0)).toBe(2800);
  });
  it('prise de 0,5 kg/semaine avec 3000 kcal → ≈ 2450 kcal', () => {
    expect(observedTdee(3000, 0.5 / 7)).toBe(2450);
  });
});
