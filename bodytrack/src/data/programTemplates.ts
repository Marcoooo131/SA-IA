import type { ProgramDay, WorkoutProgram } from '../lib/types';
import { nowISO, uid } from '../lib/format';

type Ex = [exerciseId: string, sets: number, repMin: number, repMax: number, restSec: number];
type DayDef = { name: string; weekday: number | null; exercises: Ex[] };

export interface ProgramTemplate {
  key: string;
  name: string;
  description: string;
  days: DayDef[];
}

export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  {
    key: 'ppl',
    name: 'Push / Pull / Legs',
    description: 'Poussée, tirage et jambes. 3 à 6 séances par semaine selon ta récupération.',
    days: [
      { name: 'Push', weekday: 1, exercises: [['ex-bench-press', 4, 6, 10, 150], ['ex-incline-db-press', 3, 8, 12, 120], ['ex-overhead-press', 3, 6, 10, 150], ['ex-lateral-raise', 3, 12, 15, 60], ['ex-triceps-pushdown', 3, 10, 15, 60]] },
      { name: 'Pull', weekday: 3, exercises: [['ex-pull-up', 4, 6, 10, 150], ['ex-barbell-row', 3, 8, 12, 120], ['ex-lat-pulldown', 3, 10, 12, 90], ['ex-face-pull', 3, 12, 15, 60], ['ex-db-curl', 3, 10, 12, 75]] },
      { name: 'Legs', weekday: 5, exercises: [['ex-squat', 4, 5, 8, 180], ['ex-romanian-deadlift', 3, 8, 10, 150], ['ex-leg-press', 3, 10, 12, 120], ['ex-lying-leg-curl', 3, 10, 12, 75], ['ex-standing-calf-raise', 4, 10, 15, 60]] },
    ],
  },
  {
    key: 'upper-lower',
    name: 'Upper / Lower',
    description: 'Haut du corps / bas du corps, 4 séances par semaine.',
    days: [
      { name: 'Haut A', weekday: 1, exercises: [['ex-bench-press', 4, 6, 8, 150], ['ex-barbell-row', 4, 6, 10, 120], ['ex-db-shoulder-press', 3, 8, 12, 120], ['ex-lat-pulldown', 3, 10, 12, 90], ['ex-db-curl', 2, 10, 12, 75], ['ex-triceps-pushdown', 2, 10, 12, 60]] },
      { name: 'Bas A', weekday: 2, exercises: [['ex-squat', 4, 5, 8, 180], ['ex-romanian-deadlift', 3, 8, 10, 150], ['ex-leg-extension', 3, 10, 15, 75], ['ex-lying-leg-curl', 3, 10, 12, 75], ['ex-standing-calf-raise', 3, 10, 15, 60]] },
      { name: 'Haut B', weekday: 4, exercises: [['ex-overhead-press', 4, 6, 8, 150], ['ex-pull-up', 4, 6, 10, 150], ['ex-incline-db-press', 3, 8, 12, 120], ['ex-seated-cable-row', 3, 10, 12, 90], ['ex-lateral-raise', 3, 12, 15, 60]] },
      { name: 'Bas B', weekday: 5, exercises: [['ex-deadlift', 3, 4, 6, 180], ['ex-leg-press', 3, 10, 12, 120], ['ex-bulgarian-split-squat', 3, 8, 10, 90], ['ex-seated-leg-curl', 3, 10, 12, 75], ['ex-cable-crunch', 3, 10, 15, 60]] },
    ],
  },
  {
    key: 'full-body',
    name: 'Full Body',
    description: 'Corps entier, 3 séances par semaine. Idéal pour débuter ou avec peu de temps.',
    days: [
      { name: 'Full Body A', weekday: 1, exercises: [['ex-squat', 3, 6, 8, 180], ['ex-bench-press', 3, 6, 10, 150], ['ex-barbell-row', 3, 8, 10, 120], ['ex-lateral-raise', 2, 12, 15, 60], ['ex-plank', 3, 30, 60, 60]] },
      { name: 'Full Body B', weekday: 3, exercises: [['ex-deadlift', 3, 4, 6, 180], ['ex-overhead-press', 3, 6, 10, 150], ['ex-lat-pulldown', 3, 8, 12, 90], ['ex-leg-press', 3, 10, 12, 120], ['ex-db-curl', 2, 10, 12, 75]] },
      { name: 'Full Body C', weekday: 5, exercises: [['ex-front-squat', 3, 6, 8, 180], ['ex-incline-db-press', 3, 8, 12, 120], ['ex-seated-cable-row', 3, 10, 12, 90], ['ex-hip-thrust', 3, 8, 12, 120], ['ex-triceps-pushdown', 2, 10, 15, 60]] },
    ],
  },
  {
    key: 'bro-split',
    name: 'Split par groupes musculaires',
    description: 'Pectoraux / Triceps, Dos / Biceps, Épaules, Jambes.',
    days: [
      { name: 'Pectoraux / Triceps', weekday: 1, exercises: [['ex-bench-press', 4, 6, 10, 150], ['ex-incline-bench-press', 3, 8, 10, 150], ['ex-cable-crossover', 3, 12, 15, 75], ['ex-dips', 3, 8, 12, 120], ['ex-skull-crusher', 3, 10, 12, 75]] },
      { name: 'Dos / Biceps', weekday: 2, exercises: [['ex-deadlift', 3, 4, 6, 180], ['ex-pull-up', 3, 6, 10, 150], ['ex-db-row', 3, 8, 12, 90], ['ex-barbell-curl', 3, 8, 12, 75], ['ex-hammer-curl', 3, 10, 12, 75]] },
      { name: 'Épaules', weekday: 4, exercises: [['ex-overhead-press', 4, 6, 10, 150], ['ex-lateral-raise', 4, 12, 15, 60], ['ex-rear-delt-fly', 3, 12, 15, 60], ['ex-face-pull', 3, 12, 15, 60]] },
      { name: 'Jambes', weekday: 5, exercises: [['ex-squat', 4, 6, 8, 180], ['ex-leg-press', 3, 10, 12, 120], ['ex-leg-extension', 3, 12, 15, 75], ['ex-lying-leg-curl', 3, 10, 12, 75], ['ex-seated-calf-raise', 4, 12, 15, 60]] },
    ],
  },
];

export function programFromTemplate(t: ProgramTemplate, active = false): WorkoutProgram {
  const now = nowISO();
  const days: ProgramDay[] = t.days.map((d) => ({
    id: uid(),
    name: d.name,
    weekday: d.weekday,
    exercises: d.exercises.map(([exerciseId, sets, repMin, repMax, restSec]) => ({ id: uid(), exerciseId, sets, repMin, repMax, restSec, targetWeightKg: null })),
  }));
  return { id: uid(), name: t.name, description: t.description, days, isActive: active, createdAt: now, updatedAt: now };
}
