import type { AppData, Meal, MealItem, MealType, WorkoutExercise, WorkoutSession, WorkoutSet } from '../lib/types';
import { emptyData } from '../lib/store/store';
import { addDays, isoWeekday, parseISODate } from '../lib/dates';
import { computeMetabolicPlan } from '../lib/calc/metabolism';
import { round, roundTo, uid } from '../lib/format';
import { PROGRAM_TEMPLATES, programFromTemplate } from './programTemplates';
import { BUILTIN_EXERCISES } from './exercises';
import { BUILTIN_FOODS } from './foods';
import { DEFAULT_PREFERENCES } from '../lib/defaults';

/** Générateur pseudo-aléatoire déterministe (mulberry32) : la démo est identique à chaque chargement */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE_WEIGHTS: Record<string, number> = {
  'ex-bench-press': 72.5, 'ex-barbell-row': 62.5, 'ex-db-shoulder-press': 20, 'ex-lat-pulldown': 57.5, 'ex-db-curl': 12, 'ex-triceps-pushdown': 25,
  'ex-squat': 92.5, 'ex-romanian-deadlift': 80, 'ex-leg-extension': 50, 'ex-lying-leg-curl': 40, 'ex-standing-calf-raise': 80,
  'ex-overhead-press': 45, 'ex-pull-up': 0, 'ex-incline-db-press': 24, 'ex-seated-cable-row': 57.5, 'ex-lateral-raise': 9,
  'ex-deadlift': 125, 'ex-leg-press': 170, 'ex-bulgarian-split-squat': 16, 'ex-seated-leg-curl': 40, 'ex-cable-crunch': 35,
};

/** Données de démonstration : 12 semaines d'historique réaliste se terminant aujourd'hui */
export function buildDemoData(todayDate: string): AppData {
  const r = rng(20261103);
  const data = emptyData();
  const days = 84;
  const start = addDays(todayDate, -days);
  const now = new Date().toISOString();
  data.profile = {
    id: uid(),
    displayName: 'Alex (démo)',
    sex: 'male',
    birthDate: `${parseISODate(todayDate).getFullYear() - 28}-04-12`,
    heightCm: 178,
    startWeightKg: 72.4,
    targetWeightKg: 77,
    activityLevel: 'moderate',
    trainingDaysPerWeek: 4,
    goal: 'bulk',
    physiqueGoal: 'Prendre du muscle proprement, viser 100 kg au développé couché',
    preferences: { ...DEFAULT_PREFERENCES },
    createdAt: now,
    updatedAt: now,
  };
  const plan = computeMetabolicPlan({ sex: 'male', age: 28, heightCm: 178, weightKg: 72.4, activityLevel: 'moderate', goal: 'bulk', adjustment: 250 });
  data.nutritionGoals.push({
    id: uid(), effectiveFrom: start, goal: 'bulk', calorieAdjustment: plan.adjustment, maintenanceKcal: plan.maintenance,
    calories: plan.calories, proteinG: plan.proteinG, carbsG: plan.carbsG, fatG: plan.fatG, mode: 'auto',
    proteinPerKg: plan.proteinPerKg, fatPerKg: plan.fatPerKg, updatedAt: now,
  });

  const program = programFromTemplate(PROGRAM_TEMPLATES.find((t) => t.key === 'upper-lower')!, true);
  data.programs.push(program, programFromTemplate(PROGRAM_TEMPLATES.find((t) => t.key === 'ppl')!, false));
  const exById = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));

  // État de progression par exercice (double progression)
  const state = new Map<string, { w: number; reps: number }>();
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const wd = isoWeekday(date);
    const day = program.days.find((d) => d.weekday === wd);
    if (!day || r() < 0.1) continue;
    const startH = 17 + Math.floor(r() * 3);
    const startedAt = new Date(parseISODate(date));
    startedAt.setHours(startH, Math.floor(r() * 50), 0, 0);
    const duration = (55 + Math.floor(r() * 25)) * 60000;
    const session: WorkoutSession = {
      id: uid(), name: day.name, programId: program.id, programDayId: day.id, startedAt: startedAt.toISOString(),
      endedAt: new Date(startedAt.getTime() + duration).toISOString(), status: 'done', notes: '', updatedAt: now,
    };
    data.sessions.push(session);
    let t = startedAt.getTime() + 5 * 60000;
    day.exercises.forEach((pe, idx) => {
      const ex = exById.get(pe.exerciseId)!;
      const st = state.get(pe.exerciseId) ?? { w: BASE_WEIGHTS[pe.exerciseId] ?? 20, reps: pe.repMin + 1 };
      const we: WorkoutExercise = { id: uid(), sessionId: session.id, exerciseId: pe.exerciseId, position: idx, note: '', restSec: pe.restSec, repMin: pe.repMin, repMax: pe.repMax, targetSets: pe.sets, updatedAt: now };
      data.workoutExercises.push(we);
      const bad = r() < 0.12; // séance moins bonne (fatigue)
      let allTop = true;
      for (let k = 0; k < pe.sets; k++) {
        const reps = Math.max(pe.repMin - 1, Math.min(pe.repMax, st.reps - Math.floor(k * 0.6) - (bad ? 1 : 0) + (k === 0 && r() < 0.3 ? 1 : 0)));
        if (reps < pe.repMax) allTop = false;
        t += pe.restSec * 1000 + 40000;
        const set: WorkoutSet = { id: uid(), sessionId: session.id, workoutExerciseId: we.id, exerciseId: pe.exerciseId, position: k, weightKg: st.w, reps, done: true, isWarmup: false, completedAt: new Date(t).toISOString(), updatedAt: now };
        data.sets.push(set);
      }
      if (allTop) {
        st.w = round(st.w + (ex.loadIncrementKg || 2.5), 2);
        st.reps = pe.repMin;
      } else if (!bad) st.reps = Math.min(pe.repMax, st.reps + 1);
      state.set(pe.exerciseId, st);
    });
  }

  // Pesées : tendance +0,25 kg/semaine avec fluctuations quotidiennes
  for (let i = 0; i <= days; i++) {
    if (r() < 0.18 && i !== days) continue;
    const date = addDays(start, i);
    const trend = 72.4 + (0.25 / 7) * i;
    const noise = (r() - 0.5) * 0.9 + (isoWeekday(date) === 1 ? 0.25 : 0);
    data.weights.push({ id: uid(), date, weightKg: round(trend + noise, 1), note: '', updatedAt: now });
  }

  // Journal alimentaire : repas types, quantités ajustées autour de l'objectif
  const food = (id: string) => BUILTIN_FOODS.find((f) => f.id === `food-${id}`)!;
  const templates: Record<MealType, [string, number][][]> = {
    breakfast: [[['oats', 80], ['milk-semi', 250], ['banana', 120], ['whey', 30]], [['wholemeal-bread', 80], ['egg', 165], ['butter', 10], ['orange-juice', 200]], [['skyr', 200], ['oats', 60], ['blueberries', 100], ['honey', 15]]],
    lunch: [[['rice-cooked', 250], ['chicken-breast-cooked', 150], ['broccoli', 150], ['olive-oil', 10]], [['pasta-cooked', 280], ['ground-beef-5', 150], ['tomato', 120], ['emmental', 20]], [['quinoa-cooked', 220], ['salmon-raw', 140], ['green-beans', 150], ['olive-oil', 10]]],
    snack: [[['skyr', 150], ['almonds', 30]], [['banana', 120], ['peanut-butter', 20], ['rice-cakes', 18]], [['fromage-blanc-3', 200], ['honey', 15], ['walnuts', 20]]],
    dinner: [[['potato-boiled', 300], ['turkey-raw', 150], ['mixed-veg', 200], ['olive-oil', 10]], [['rice-cooked', 220], ['tuna-canned', 120], ['zucchini', 200], ['olive-oil', 10]], [['sweet-potato', 280], ['beef-rump', 150], ['salad', 60], ['olive-oil', 10]], [['pasta-cooked', 250], ['shrimp-cooked', 150], ['spinach', 150], ['olive-oil', 10]]],
  };
  const mealTypes: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];
  for (let i = 0; i <= days; i++) {
    const date = addDays(start, i);
    if (r() < 0.1 && i !== days) continue;
    const scale = 0.93 + r() * 0.16;
    for (const mt of mealTypes) {
      if (i === days && mt === 'dinner') continue; // aujourd'hui : dîner pas encore saisi
      if (mt === 'snack' && r() < 0.15) continue;
      const choice = templates[mt][Math.floor(r() * templates[mt].length)];
      const meal: Meal = { id: uid(), date, mealType: mt, isFavorite: false, favoriteName: '', createdAt: now, updatedAt: now };
      data.meals.push(meal);
      choice.forEach(([fid, q], pos) => {
        const f = food(fid);
        const qty = roundTo(q * (fid === 'whey' || fid === 'olive-oil' || fid === 'egg' ? 1 : scale), 5);
        const item: MealItem = { id: uid(), mealId: meal.id, foodId: f.id, name: f.name, quantity: qty, unit: f.unit, kcal100: f.kcal100, protein100: f.protein100, carbs100: f.carbs100, fat100: f.fat100, position: pos, updatedAt: now };
        data.mealItems.push(item);
      });
    }
  }
  // Un repas favori
  const fav: Meal = { id: uid(), date: null, mealType: 'breakfast', isFavorite: true, favoriteName: 'Petit-déj avoine & whey', createdAt: now, updatedAt: now };
  data.meals.push(fav);
  templates.breakfast[0].forEach(([fid, q], pos) => {
    const f = food(fid);
    data.mealItems.push({ id: uid(), mealId: fav.id, foodId: f.id, name: f.name, quantity: q, unit: f.unit, kcal100: f.kcal100, protein100: f.protein100, carbs100: f.carbs100, fat100: f.fat100, position: pos, updatedAt: now });
  });

  // Mensurations toutes les deux semaines
  for (let i = 0, k = 0; i <= days; i += 14, k++) {
    data.measurements.push({
      id: uid(), date: addDays(start, i), chestCm: round(98 + k * 0.4 + (r() - 0.5) * 0.4, 1), waistCm: round(79 + k * 0.15 + (r() - 0.5) * 0.4, 1),
      armCm: round(34 + k * 0.25 + (r() - 0.5) * 0.2, 1), thighCm: round(55 + k * 0.3 + (r() - 0.5) * 0.3, 1), hipsCm: round(94 + k * 0.1, 1),
      calfCm: round(36 + k * 0.05, 1), note: '', updatedAt: now,
    });
  }

  // Journal physique hebdomadaire
  const notes = ['Bonne énergie, séances fluides.', 'Sommeil un peu court cette semaine.', 'Motivation au top après le record au squat.', 'Légère fatigue en fin de semaine.', 'Digestion meilleure depuis que je fractionne les repas.'];
  for (let i = 3; i <= days; i += 7) {
    data.journal.push({ id: uid(), date: addDays(start, i), energy: 3 + Math.floor(r() * 3), sleepQuality: 2 + Math.floor(r() * 4), sleepHours: round(6.5 + r() * 2, 1), motivation: 3 + Math.floor(r() * 3), difficulties: '', text: notes[Math.floor(r() * notes.length)], updatedAt: now });
  }

  // Objectifs personnalisés
  data.goals.push(
    { id: uid(), type: 'strength', title: 'Développé couché : 1RM estimé de 100 kg', exerciseId: 'ex-bench-press', metric: 'e1rm', referenceWeightKg: null, startValue: 90, targetValue: 100, deadline: addDays(todayDate, 120), createdAt: now, achievedAt: null, updatedAt: now },
    { id: uid(), type: 'weight', title: 'Atteindre 77 kg', exerciseId: null, metric: 'avg7', referenceWeightKg: null, startValue: 72.4, targetValue: 77, deadline: null, createdAt: now, achievedAt: null, updatedAt: now },
    { id: uid(), type: 'consistency', title: '4 séances par semaine', exerciseId: null, metric: 'sessions_per_week', referenceWeightKg: null, startValue: 0, targetValue: 4, deadline: null, createdAt: now, achievedAt: null, updatedAt: now },
    { id: uid(), type: 'nutrition', title: 'Objectif protéique 25 jours sur 30', exerciseId: null, metric: 'protein_days', referenceWeightKg: null, startValue: 0, targetValue: 25, deadline: null, createdAt: now, achievedAt: null, updatedAt: now },
  );
  return data;
}
