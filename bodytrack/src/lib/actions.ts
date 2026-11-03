/**
 * Opérations métier : elles combinent plusieurs écritures dans le magasin de données.
 * Les écrans appellent ces fonctions plutôt que de manipuler les collections directement.
 */
import type { ActivityLevel, Food, GoalType, ISODate, Meal, MealItem, MealType, NutritionGoal, Profile, ProgramDay, Sex, WorkoutExercise, WorkoutProgram, WorkoutSession, WorkoutSet } from './types';
import { store } from './store/store';
import { nowISO, uid } from './format';
import { ageFromBirthDate, dateOf, today } from './dates';
import { computeMetabolicPlan, macroSplit } from './calc/metabolism';
import { exerciseHistory, recordsBrokenBySet, workingSets, type PerfSet } from './calc/training';
import { buildContext } from './analytics/context';
import { DEFAULT_PREFERENCES } from './defaults';

const data = () => store().data;
const stamp = () => nowISO();

// ---------------------------------------------------------------- Profil & objectifs

export interface OnboardingInput {
  displayName: string;
  sex: Sex;
  birthDate: ISODate;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  activityLevel: ActivityLevel;
  trainingDaysPerWeek: number;
  goal: GoalType;
  physiqueGoal: string;
  adjustment: number;
}

export function completeOnboarding(i: OnboardingInput) {
  const now = stamp();
  const profile: Profile = {
    id: uid(),
    displayName: i.displayName.trim(),
    sex: i.sex,
    birthDate: i.birthDate,
    heightCm: i.heightCm,
    startWeightKg: i.weightKg,
    targetWeightKg: i.targetWeightKg,
    activityLevel: i.activityLevel,
    trainingDaysPerWeek: i.trainingDaysPerWeek,
    goal: i.goal,
    physiqueGoal: i.physiqueGoal.trim(),
    preferences: { ...DEFAULT_PREFERENCES },
    createdAt: now,
    updatedAt: now,
  };
  store().saveProfile(profile);
  recomputeNutritionGoal({ weightKg: i.weightKg, adjustment: i.adjustment });
  logWeight(today(), i.weightKg);
}

/** Recalcule l'objectif nutritionnel automatique à partir du profil (et du poids moyen récent) */
export function recomputeNutritionGoal(opts: { weightKg?: number; adjustment?: number; proteinPerKg?: number; fatPerKg?: number; maintenanceOverride?: number } = {}) {
  const p = data().profile;
  if (!p) return;
  const ctx = buildContext(data());
  const cur = ctx.goalOn(today());
  const weight = opts.weightKg ?? latestWeight() ?? p.startWeightKg;
  const plan = computeMetabolicPlan({
    sex: p.sex,
    age: ageFromBirthDate(p.birthDate),
    heightCm: p.heightCm,
    weightKg: weight,
    activityLevel: p.activityLevel,
    goal: p.goal,
    adjustment: opts.adjustment ?? (cur && cur.goal === p.goal ? cur.calorieAdjustment : undefined),
    proteinPerKg: opts.proteinPerKg ?? (cur && cur.goal === p.goal ? cur.proteinPerKg : undefined),
    fatPerKg: opts.fatPerKg ?? cur?.fatPerKg,
  });
  let { calories, proteinG, carbsG, fatG } = plan;
  let maintenance = plan.maintenance;
  if (opts.maintenanceOverride) {
    maintenance = opts.maintenanceOverride;
    calories = Math.round((maintenance + plan.adjustment) / 10) * 10;
    ({ proteinG, carbsG, fatG } = macroSplit(calories, weight, plan.proteinPerKg, plan.fatPerKg));
  }
  saveNutritionGoal({ goal: p.goal, calorieAdjustment: plan.adjustment, maintenanceKcal: maintenance, calories, proteinG, carbsG, fatG, mode: 'auto', proteinPerKg: plan.proteinPerKg, fatPerKg: plan.fatPerKg });
}

/** Enregistre un objectif nutritionnel effectif à partir d'aujourd'hui (l'historique est conservé) */
export function saveNutritionGoal(g: Omit<NutritionGoal, 'id' | 'updatedAt' | 'effectiveFrom' | 'deletedAt'>) {
  const t = today();
  const existing = data().nutritionGoals.find((x) => x.effectiveFrom === t);
  store().upsert('nutritionGoals', { ...g, id: existing?.id ?? uid(), effectiveFrom: t, updatedAt: stamp() });
}

export function adjustCalories(deltaKcal: number) {
  const ctx = buildContext(data());
  const cur = ctx.goalOn(today());
  const weight = latestWeight() ?? data().profile?.startWeightKg ?? 70;
  if (!cur) return;
  const calories = cur.calories + deltaKcal;
  const m = macroSplit(calories, weight, cur.proteinPerKg, cur.fatPerKg);
  saveNutritionGoal({ ...cur, calorieAdjustment: calories - cur.maintenanceKcal, calories, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG, mode: 'manual' });
}

export function latestWeight(): number | null {
  const w = [...data().weights].sort((a, b) => a.date.localeCompare(b.date));
  return w.length ? w[w.length - 1].weightKg : null;
}

// ---------------------------------------------------------------- Poids, mensurations

export function logWeight(date: ISODate, weightKg: number, note = '') {
  const existing = data().weights.find((w) => w.date === date);
  store().upsert('weights', { id: existing?.id ?? uid(), date, weightKg, note: note || existing?.note || '', updatedAt: stamp() });
}

// ---------------------------------------------------------------- Séances

function lastPerformanceSets(exerciseId: string, excludeSessionId?: string): PerfSet[] {
  const d = data();
  const h = exerciseHistory(exerciseId, d.sessions, d.sets, { excludeSessionId });
  return h.length ? h[h.length - 1].sets : [];
}

export function startSession(opts: { programId?: string; dayId?: string; name?: string } = {}): string {
  const d = data();
  const program = opts.programId ? d.programs.find((p) => p.id === opts.programId) : undefined;
  const day = program?.days.find((x) => x.id === opts.dayId);
  const now = stamp();
  const session: WorkoutSession = {
    id: uid(),
    name: opts.name ?? (day ? day.name : 'Séance libre'),
    programId: program?.id ?? null,
    programDayId: day?.id ?? null,
    startedAt: now,
    endedAt: null,
    status: 'active',
    notes: '',
    updatedAt: now,
  };
  store().upsert('sessions', session);
  if (day) day.exercises.forEach((pe) => addExerciseToSession(session.id, pe.exerciseId, pe));
  return session.id;
}

export function addExerciseToSession(sessionId: string, exerciseId: string, target?: ProgramDay['exercises'][number]) {
  const ctx = buildContext(data());
  const ex = ctx.exById.get(exerciseId);
  const existing = ctx.wexBySession.get(sessionId) ?? [];
  const now = stamp();
  const we: WorkoutExercise = {
    id: uid(),
    sessionId,
    exerciseId,
    position: existing.length ? Math.max(...existing.map((e) => e.position)) + 1 : 0,
    note: target?.note ?? '',
    restSec: target?.restSec ?? ex?.defaultRestSec ?? data().profile?.preferences.defaultRestSec ?? 120,
    repMin: target?.repMin ?? null,
    repMax: target?.repMax ?? null,
    targetSets: target?.sets ?? null,
    updatedAt: now,
  };
  store().upsert('workoutExercises', we);
  const prefill = data().profile?.preferences.prefillFromLastSession ?? true;
  const last = lastPerformanceSets(exerciseId, sessionId);
  const n = target?.sets ?? (last.length || 3);
  const sets: WorkoutSet[] = Array.from({ length: n }, (_, i) => {
    const ref = prefill ? (last[i] ?? last[last.length - 1]) : undefined;
    return {
      id: uid(),
      sessionId,
      workoutExerciseId: we.id,
      exerciseId,
      position: i,
      weightKg: ref?.weightKg ?? target?.targetWeightKg ?? null,
      reps: ref?.reps ?? target?.repMax ?? null,
      done: false,
      isWarmup: false,
      completedAt: null,
      updatedAt: now,
    };
  });
  store().upsert('sets', sets);
  return we.id;
}

export function addSet(we: WorkoutExercise) {
  const sets = data().sets.filter((s) => s.workoutExerciseId === we.id).sort((a, b) => a.position - b.position);
  const last = sets[sets.length - 1];
  store().upsert('sets', {
    id: uid(),
    sessionId: we.sessionId,
    workoutExerciseId: we.id,
    exerciseId: we.exerciseId,
    position: last ? last.position + 1 : 0,
    weightKg: last?.weightKg ?? null,
    reps: last?.reps ?? null,
    done: false,
    isWarmup: false,
    completedAt: null,
    updatedAt: stamp(),
  });
}

/** Copie les charges et répétitions de la dernière séance dans les séries non validées */
export function copyLastPerformance(we: WorkoutExercise) {
  const last = lastPerformanceSets(we.exerciseId, we.sessionId);
  if (!last.length) return false;
  const sets = data().sets.filter((s) => s.workoutExerciseId === we.id).sort((a, b) => a.position - b.position);
  const updates: WorkoutSet[] = [];
  last.forEach((ref, i) => {
    const s = sets[i];
    if (s && s.done) return;
    if (s) updates.push({ ...s, weightKg: ref.weightKg, reps: ref.reps });
    else updates.push({ id: uid(), sessionId: we.sessionId, workoutExerciseId: we.id, exerciseId: we.exerciseId, position: (sets[sets.length - 1]?.position ?? -1) + 1 + i, weightKg: ref.weightKg, reps: ref.reps, done: false, isWarmup: false, completedAt: null, updatedAt: stamp() });
  });
  store().upsert('sets', updates);
  return true;
}

/** Applique une charge (suggestion validée par l'utilisateur) aux séries non validées */
export function applyWeightToPendingSets(we: WorkoutExercise, weightKg: number, reps?: number | null) {
  const sets = data().sets.filter((s) => s.workoutExerciseId === we.id && !s.done && !s.isWarmup);
  store().upsert('sets', sets.map((s) => ({ ...s, weightKg, reps: reps ?? s.reps })));
}

export interface ValidateResult {
  records: ReturnType<typeof recordsBrokenBySet>;
  previousSameIndex: PerfSet | null;
}

/** Valide une série et détecte les records par rapport à tout l'historique antérieur */
export function validateSet(set: WorkoutSet): ValidateResult {
  const d = data();
  const history = exerciseHistory(set.exerciseId, d.sessions, d.sets, { excludeSessionId: set.sessionId }).flatMap((p) => p.sets);
  // Séries déjà validées dans la séance en cours (avant celle-ci)
  const current = workingSets(d.sets.filter((s) => s.sessionId === set.sessionId && s.exerciseId === set.exerciseId && s.id !== set.id)).map((s) => ({ weightKg: s.weightKg ?? 0, reps: s.reps ?? 0 }));
  const records = set.isWarmup ? [] : recordsBrokenBySet([...history, ...current], { weightKg: set.weightKg ?? 0, reps: set.reps ?? 0 });
  store().upsert('sets', { ...set, done: true, completedAt: stamp() });
  const last = lastPerformanceSets(set.exerciseId, set.sessionId);
  const idx = d.sets.filter((s) => s.workoutExerciseId === set.workoutExerciseId && !s.isWarmup && s.position < set.position).length;
  return { records, previousSameIndex: last[idx] ?? null };
}

export function finishSession(sessionId: string) {
  const s = data().sessions.find((x) => x.id === sessionId);
  if (!s) return;
  // Les séries non validées ne sont pas conservées
  const pending = data().sets.filter((x) => x.sessionId === sessionId && !x.done).map((x) => x.id);
  store().remove('sets', pending);
  const remaining = data().sets.filter((x) => x.sessionId === sessionId);
  const emptyWe = data().workoutExercises.filter((w) => w.sessionId === sessionId && !remaining.some((x) => x.workoutExerciseId === w.id)).map((w) => w.id);
  store().remove('workoutExercises', emptyWe);
  store().upsert('sessions', { ...s, status: 'done', endedAt: stamp() });
}

export function deleteSession(sessionId: string) {
  const d = data();
  store().remove('sets', d.sets.filter((x) => x.sessionId === sessionId).map((x) => x.id));
  store().remove('workoutExercises', d.workoutExercises.filter((x) => x.sessionId === sessionId).map((x) => x.id));
  store().remove('sessions', sessionId);
}

export function removeExerciseFromSession(weId: string) {
  store().remove('sets', data().sets.filter((x) => x.workoutExerciseId === weId).map((x) => x.id));
  store().remove('workoutExercises', weId);
}

export function moveSessionExercise(sessionId: string, weId: string, dir: -1 | 1) {
  const list = data().workoutExercises.filter((w) => w.sessionId === sessionId).sort((a, b) => a.position - b.position);
  const i = list.findIndex((w) => w.id === weId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const a = list[i];
  const b = list[j];
  store().upsert('workoutExercises', [
    { ...a, position: b.position },
    { ...b, position: a.position },
  ]);
}

// ---------------------------------------------------------------- Programmes

export function duplicateProgram(p: WorkoutProgram) {
  const now = stamp();
  const copy: WorkoutProgram = {
    ...p,
    id: uid(),
    name: `${p.name} (copie)`,
    isActive: false,
    createdAt: now,
    updatedAt: now,
    days: p.days.map((d) => ({ ...d, id: uid(), exercises: d.exercises.map((e) => ({ ...e, id: uid() })) })),
  };
  store().upsert('programs', copy);
  return copy.id;
}

export function setActiveProgram(id: string | null) {
  const updates = data()
    .programs.filter((p) => p.isActive !== (p.id === id))
    .map((p) => ({ ...p, isActive: p.id === id }));
  store().upsert('programs', updates);
}

// ---------------------------------------------------------------- Nutrition

export function getOrCreateMeal(date: ISODate, mealType: MealType): Meal {
  const m = data().meals.find((x) => x.date === date && x.mealType === mealType && !x.isFavorite);
  if (m) return m;
  const now = stamp();
  const meal: Meal = { id: uid(), date, mealType, isFavorite: false, favoriteName: '', createdAt: now, updatedAt: now };
  store().upsert('meals', meal);
  return meal;
}

export function itemFromFood(mealId: string, f: Pick<Food, 'id' | 'name' | 'unit' | 'kcal100' | 'protein100' | 'carbs100' | 'fat100'> & { brand?: string }, quantity: number, position: number): MealItem {
  return {
    id: uid(),
    mealId,
    foodId: f.id,
    name: f.brand ? `${f.name} – ${f.brand}` : f.name,
    quantity,
    unit: f.unit,
    kcal100: f.kcal100,
    protein100: f.protein100,
    carbs100: f.carbs100,
    fat100: f.fat100,
    position,
    updatedAt: stamp(),
  };
}

export function addFoodToMeal(date: ISODate, mealType: MealType, food: Food, quantity: number) {
  const meal = getOrCreateMeal(date, mealType);
  const pos = data().mealItems.filter((i) => i.mealId === meal.id).length;
  store().upsert('mealItems', itemFromFood(meal.id, food, quantity, pos));
}

/** Copie les aliments d'un repas (ou d'un favori) vers une date et un type de repas */
export function copyMealItems(sourceMealId: string, date: ISODate, mealType: MealType) {
  const items = data().mealItems.filter((i) => i.mealId === sourceMealId).sort((a, b) => a.position - b.position);
  if (!items.length) return 0;
  const target = getOrCreateMeal(date, mealType);
  const offset = data().mealItems.filter((i) => i.mealId === target.id).length;
  store().upsert(
    'mealItems',
    items.map((it, k) => ({ ...it, id: uid(), mealId: target.id, position: offset + k })),
  );
  return items.length;
}

export function saveMealAsFavorite(mealId: string, name: string) {
  const src = data().meals.find((m) => m.id === mealId);
  if (!src) return;
  const now = stamp();
  const fav: Meal = { id: uid(), date: null, mealType: src.mealType, isFavorite: true, favoriteName: name.trim() || 'Repas favori', createdAt: now, updatedAt: now };
  store().upsert('meals', fav);
  const items = data().mealItems.filter((i) => i.mealId === mealId);
  store().upsert(
    'mealItems',
    items.map((it) => ({ ...it, id: uid(), mealId: fav.id })),
  );
}

export function deleteMeal(mealId: string) {
  store().remove('mealItems', data().mealItems.filter((i) => i.mealId === mealId).map((i) => i.id));
  store().remove('meals', mealId);
}

/** Aliments récemment utilisés (par nom + valeurs), du plus récent au plus ancien */
export function recentFoodIds(limit = 12): string[] {
  const items = [...data().mealItems].filter((i) => i.foodId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const out: string[] = [];
  for (const i of items) {
    if (!out.includes(i.foodId!)) out.push(i.foodId!);
    if (out.length >= limit) break;
  }
  return out;
}

export function sessionDateOf(s: WorkoutSession) {
  return dateOf(s.startedAt);
}
