import type { AppData, Exercise, Food, ISODate, Meal, MealItem, NutritionGoal, WorkoutExercise, WorkoutSession, WorkoutSet } from '../types';
import { BUILTIN_EXERCISES } from '../../data/exercises';
import { BUILTIN_FOODS } from '../../data/foods';
import { dateOf } from '../dates';
import { exerciseHistory, type ExercisePerformance } from '../calc/training';
import { sumItems, type Nutrients } from '../calc/nutrition';

/**
 * Index dérivé des données brutes : construit une fois par changement de données,
 * il évite de reparcourir toutes les collections dans chaque écran.
 */
export interface Ctx {
  data: AppData;
  exercises: Exercise[];
  exById: Map<string, Exercise>;
  foods: Food[];
  foodById: Map<string, Food>;
  doneSessions: WorkoutSession[];
  activeSession: WorkoutSession | null;
  setsBySession: Map<string, WorkoutSet[]>;
  wexBySession: Map<string, WorkoutExercise[]>;
  sessionDate: (s: WorkoutSession) => ISODate;
  history: (exerciseId: string) => ExercisePerformance[];
  mealsByDate: Map<ISODate, Meal[]>;
  itemsByMeal: Map<string, MealItem[]>;
  favorites: Meal[];
  dayTotals: (date: ISODate) => Nutrients;
  dayItemCount: (date: ISODate) => number;
  loggedDates: Set<ISODate>;
  goalOn: (date: ISODate) => NutritionGoal | null;
  /** Exercices déjà pratiqués (au moins une série validée) */
  practicedExerciseIds: Set<string>;
}

function groupBy<T>(rows: T[], keyOf: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}

export function buildContext(data: AppData): Ctx {
  const exercises = [...BUILTIN_EXERCISES, ...data.exercises.filter((e) => !e.deletedAt)];
  const exById = new Map(exercises.map((e) => [e.id, e]));
  const foods = [...data.foods.filter((f) => !f.deletedAt), ...BUILTIN_FOODS];
  const foodById = new Map(foods.map((f) => [f.id, f]));
  const sessions = data.sessions.filter((s) => !s.deletedAt);
  const doneSessions = sessions.filter((s) => s.status === 'done').sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const activeSession = sessions.filter((s) => s.status === 'active').sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
  const liveSets = data.sets.filter((s) => !s.deletedAt);
  const setsBySession = groupBy(liveSets, (s) => s.sessionId);
  const wexBySession = groupBy(
    data.workoutExercises.filter((w) => !w.deletedAt),
    (w) => w.sessionId,
  );
  for (const arr of wexBySession.values()) arr.sort((a, b) => a.position - b.position);

  const historyCache = new Map<string, ExercisePerformance[]>();
  const setsByExercise = groupBy(liveSets, (s) => s.exerciseId);
  const history = (exerciseId: string) => {
    let h = historyCache.get(exerciseId);
    if (!h) {
      h = exerciseHistory(exerciseId, doneSessions, setsByExercise.get(exerciseId) ?? []);
      historyCache.set(exerciseId, h);
    }
    return h;
  };
  const doneIds = new Set(doneSessions.map((s) => s.id));
  const practicedExerciseIds = new Set(liveSets.filter((s) => s.done && !s.isWarmup && doneIds.has(s.sessionId)).map((s) => s.exerciseId));

  const meals = data.meals.filter((m) => !m.deletedAt);
  const favorites = meals.filter((m) => m.isFavorite);
  const mealsByDate = groupBy(
    meals.filter((m) => m.date && !m.isFavorite),
    (m) => m.date!,
  );
  const itemsByMeal = groupBy(
    data.mealItems.filter((i) => !i.deletedAt),
    (i) => i.mealId,
  );
  for (const arr of itemsByMeal.values()) arr.sort((a, b) => a.position - b.position);
  const totalsCache = new Map<string, Nutrients>();
  const dayItems = (date: ISODate) => (mealsByDate.get(date) ?? []).flatMap((m) => itemsByMeal.get(m.id) ?? []);
  const dayTotals = (date: ISODate) => {
    let t = totalsCache.get(date);
    if (!t) {
      t = sumItems(dayItems(date));
      totalsCache.set(date, t);
    }
    return t;
  };
  const loggedDates = new Set<ISODate>();
  for (const [date, ms] of mealsByDate) if (ms.some((m) => (itemsByMeal.get(m.id) ?? []).length > 0)) loggedDates.add(date);

  const goals = data.nutritionGoals.filter((g) => !g.deletedAt).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.updatedAt.localeCompare(b.updatedAt));
  const goalOn = (date: ISODate) => {
    let g: NutritionGoal | null = null;
    for (const x of goals) if (x.effectiveFrom <= date) g = x;
    return g ?? goals[0] ?? null;
  };

  return {
    data,
    exercises,
    exById,
    foods,
    foodById,
    doneSessions,
    activeSession,
    setsBySession,
    wexBySession,
    sessionDate: (s) => dateOf(s.startedAt),
    history,
    mealsByDate,
    itemsByMeal,
    favorites,
    dayTotals,
    dayItemCount: (date) => dayItems(date).length,
    loggedDates,
    goalOn,
    practicedExerciseIds,
  };
}
