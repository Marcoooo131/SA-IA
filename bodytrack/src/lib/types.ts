/**
 * Modèle de données BODYTRACK.
 * Chaque entité synchronisable porte un identifiant UUID, une date de mise à jour et une
 * éventuelle date de suppression (suppression « douce » pour la synchronisation différée).
 * Les noms de champs correspondent, en snake_case, aux colonnes des tables Supabase.
 */

export type ISODate = string; // AAAA-MM-JJ (date locale)
export type ISODateTime = string; // horodatage ISO 8601

export interface BaseEntity {
  id: string;
  updatedAt: ISODateTime;
  deletedAt?: ISODateTime | null;
}

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type GoalType = 'bulk' | 'maintain' | 'cut';

export interface Preferences {
  defaultRestSec: number;
  restSound: boolean;
  restVibration: boolean;
  restNotification: boolean;
  autoStartRest: boolean;
  /** Remplir automatiquement les séries avec la dernière séance au démarrage */
  prefillFromLastSession: boolean;
}

export interface Profile extends BaseEntity {
  displayName: string;
  sex: Sex;
  birthDate: ISODate;
  heightCm: number;
  startWeightKg: number;
  targetWeightKg: number;
  activityLevel: ActivityLevel;
  trainingDaysPerWeek: number;
  goal: GoalType;
  physiqueGoal: string;
  preferences: Preferences;
  createdAt: ISODateTime;
}

export interface NutritionGoal extends BaseEntity {
  effectiveFrom: ISODate;
  goal: GoalType;
  /** Ajustement calorique par rapport au maintien (positif = surplus, négatif = déficit) */
  calorieAdjustment: number;
  maintenanceKcal: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** auto = calculé ; manual = saisi par l'utilisateur */
  mode: 'auto' | 'manual';
  proteinPerKg: number;
  fatPerKg: number;
}

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'abs';

export type ExerciseType = 'compound' | 'isolation';
export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'kettlebell'
  | 'band'
  | 'other';

export interface Exercise extends BaseEntity {
  name: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  type: ExerciseType;
  equipment: Equipment;
  description: string;
  instructions: string[];
  defaultRestSec: number;
  /** Incrément de charge conseillé (kg) */
  loadIncrementKg: number;
  isCustom: boolean;
}

export interface ProgramExercise {
  id: string;
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  targetWeightKg?: number | null;
  note?: string;
}

export interface ProgramDay {
  id: string;
  name: string;
  /** 1 = lundi … 7 = dimanche ; null = non planifié (rotation) */
  weekday: number | null;
  exercises: ProgramExercise[];
}

export interface WorkoutProgram extends BaseEntity {
  name: string;
  description: string;
  days: ProgramDay[];
  isActive: boolean;
  createdAt: ISODateTime;
}

export interface WorkoutSession extends BaseEntity {
  name: string;
  programId: string | null;
  programDayId: string | null;
  startedAt: ISODateTime;
  endedAt: ISODateTime | null;
  status: 'active' | 'done';
  notes: string;
}

export interface WorkoutExercise extends BaseEntity {
  sessionId: string;
  exerciseId: string;
  position: number;
  note: string;
  restSec: number;
  repMin: number | null;
  repMax: number | null;
  targetSets: number | null;
}

export interface WorkoutSet extends BaseEntity {
  sessionId: string;
  workoutExerciseId: string;
  exerciseId: string;
  position: number;
  weightKg: number | null;
  reps: number | null;
  done: boolean;
  isWarmup: boolean;
  completedAt: ISODateTime | null;
}

export type FoodUnit = 'g' | 'ml';

export interface Food extends BaseEntity {
  name: string;
  brand: string;
  unit: FoodUnit;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  /** Portion usuelle (g ou ml) */
  servingSize: number | null;
  servingLabel: string;
  category: string;
  source: 'builtin' | 'custom' | 'openfoodfacts';
  barcode: string | null;
}

export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export interface Meal extends BaseEntity {
  /** Date du repas ; null pour un repas favori (modèle) */
  date: ISODate | null;
  mealType: MealType;
  isFavorite: boolean;
  favoriteName: string;
  createdAt: ISODateTime;
}

export interface MealItem extends BaseEntity {
  mealId: string;
  foodId: string | null;
  name: string;
  quantity: number;
  unit: FoodUnit;
  /** Valeurs nutritionnelles pour 100 g/ml copiées au moment de l'ajout (historique stable) */
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  position: number;
}

export interface WeightLog extends BaseEntity {
  date: ISODate;
  weightKg: number;
  note: string;
}

export type MeasurementKey = 'chestCm' | 'waistCm' | 'armCm' | 'thighCm' | 'hipsCm' | 'calfCm';

export interface BodyMeasurement extends BaseEntity {
  date: ISODate;
  chestCm: number | null;
  waistCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  hipsCm: number | null;
  calfCm: number | null;
  note: string;
}

export type PhotoPose = 'front' | 'side' | 'back';

export interface ProgressPhoto extends BaseEntity {
  date: ISODate;
  pose: PhotoPose;
  /** Chemin dans le bucket privé Supabase (null tant que non envoyée) */
  storagePath: string | null;
  note: string;
}

export interface JournalEntry extends BaseEntity {
  date: ISODate;
  energy: number | null; // 1 à 5
  sleepQuality: number | null; // 1 à 5
  sleepHours: number | null;
  motivation: number | null; // 1 à 5
  difficulties: string;
  text: string;
}

export type UserGoalType = 'weight' | 'strength' | 'reps' | 'consistency' | 'nutrition' | 'measurement';

export interface UserGoal extends BaseEntity {
  type: UserGoalType;
  title: string;
  exerciseId: string | null;
  /** strength : 'e1rm' | 'weight' ; reps : charge de référence ; nutrition : 'protein_days' | 'logged_days' ; measurement : clé */
  metric: string;
  referenceWeightKg: number | null;
  startValue: number;
  targetValue: number;
  deadline: ISODate | null;
  createdAt: ISODateTime;
  achievedAt: ISODateTime | null;
}

export interface Achievement extends BaseEntity {
  key: string;
  unlockedAt: ISODateTime;
}

export interface WeeklyReportRecord extends BaseEntity {
  weekStart: ISODate;
  data: unknown;
  createdAt: ISODateTime;
}

export interface Collections {
  nutritionGoals: NutritionGoal[];
  exercises: Exercise[];
  programs: WorkoutProgram[];
  sessions: WorkoutSession[];
  workoutExercises: WorkoutExercise[];
  sets: WorkoutSet[];
  foods: Food[];
  meals: Meal[];
  mealItems: MealItem[];
  weights: WeightLog[];
  measurements: BodyMeasurement[];
  photos: ProgressPhoto[];
  journal: JournalEntry[];
  goals: UserGoal[];
  achievements: Achievement[];
  weeklyReports: WeeklyReportRecord[];
}

export type CollectionName = keyof Collections;

export interface AppData extends Collections {
  profile: Profile | null;
}
