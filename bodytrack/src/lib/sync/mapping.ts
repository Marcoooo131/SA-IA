import type { CollectionName } from '../types';

export const TABLES: Record<CollectionName | 'profile', string> = {
  profile: 'profiles',
  nutritionGoals: 'nutrition_goals',
  exercises: 'exercise_library',
  programs: 'workout_programs',
  sessions: 'workout_sessions',
  workoutExercises: 'workout_exercises',
  sets: 'workout_sets',
  foods: 'food_library',
  meals: 'meals',
  mealItems: 'meal_items',
  weights: 'weight_logs',
  measurements: 'body_measurements',
  photos: 'progress_photos',
  journal: 'journal_entries',
  goals: 'user_goals',
  achievements: 'achievements',
  weeklyReports: 'weekly_reports',
};

const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

// Exceptions de nommage (chiffres dans les noms de colonnes)
const SNAKE_OVERRIDES: Record<string, string> = { kcal100: 'kcal_100', protein100: 'protein_100', carbs100: 'carbs_100', fat100: 'fat_100' };
const CAMEL_OVERRIDES: Record<string, string> = Object.fromEntries(Object.entries(SNAKE_OVERRIDES).map(([k, v]) => [v, k]));

/** Entité locale → ligne distante */
export function toRemote(row: Record<string, unknown>, userId: string): Record<string, unknown> {
  const out: Record<string, unknown> = { user_id: userId };
  for (const [k, v] of Object.entries(row)) out[SNAKE_OVERRIDES[k] ?? toSnake(k)] = v === undefined ? null : v;
  return out;
}

/** Ligne distante → entité locale (dates normalisées en ISO « Z » pour des comparaisons fiables) */
export function fromRemote(row: Record<string, unknown>): Record<string, unknown> & { id: string; updatedAt: string } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'user_id' || k === 'server_updated_at') continue;
    const ck = CAMEL_OVERRIDES[k] ?? toCamel(k);
    out[ck] = ck.endsWith('At') && typeof v === 'string' ? new Date(v).toISOString() : v;
  }
  return out as Record<string, unknown> & { id: string; updatedAt: string };
}
