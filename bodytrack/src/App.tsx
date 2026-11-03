import { lazy, Suspense, useEffect } from 'react';
import { useStore } from './lib/store/store';
import { match, usePath, useScrollTop } from './lib/router';
import { AppShell } from './components/AppShell';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import { initSync } from './lib/sync/sync';
import { useAutoReports } from './lib/autoReports';

const Coach = lazy(() => import('./pages/Coach'));
const TrainingHome = lazy(() => import('./pages/training/TrainingHome'));
const ProgramEditor = lazy(() => import('./pages/training/ProgramEditor'));
const SessionView = lazy(() => import('./pages/training/SessionView'));
const Records = lazy(() => import('./pages/training/Records'));
const MuscleVolumePage = lazy(() => import('./pages/training/MuscleVolume'));
const ExerciseLibrary = lazy(() => import('./pages/exercises/ExerciseLibrary'));
const ExerciseDetail = lazy(() => import('./pages/exercises/ExerciseDetail'));
const NutritionJournal = lazy(() => import('./pages/nutrition/Journal'));
const NutritionGoals = lazy(() => import('./pages/nutrition/Goals'));
const Simulator = lazy(() => import('./pages/nutrition/Simulator'));
const NutritionTrends = lazy(() => import('./pages/nutrition/Trends'));
const WeightPage = lazy(() => import('./pages/progress/Weight'));
const Measurements = lazy(() => import('./pages/progress/Measurements'));
const Photos = lazy(() => import('./pages/progress/Photos'));
const BodyJournal = lazy(() => import('./pages/progress/BodyJournal'));
const GoalsPage = lazy(() => import('./pages/progress/Goals'));
const CalendarPage = lazy(() => import('./pages/progress/Calendar'));
const WeeklyReportPage = lazy(() => import('./pages/progress/WeeklyReport'));
const MonthlyReportPage = lazy(() => import('./pages/progress/MonthlyReport'));
const ProfilePage = lazy(() => import('./pages/Profile'));

const ROUTES: [string, React.ComponentType<{ params: Record<string, string> }>][] = [
  ['/', Dashboard],
  ['/coach', Coach],
  ['/training', TrainingHome],
  ['/training/history', TrainingHome],
  ['/training/records', Records],
  ['/training/volume', MuscleVolumePage],
  ['/training/program/:id', ProgramEditor],
  ['/training/session/:id', SessionView],
  ['/exercises', ExerciseLibrary],
  ['/exercises/:id', ExerciseDetail],
  ['/nutrition', NutritionJournal],
  ['/nutrition/goals', NutritionGoals],
  ['/nutrition/simulator', Simulator],
  ['/nutrition/trends', NutritionTrends],
  ['/progress', WeightPage],
  ['/progress/measurements', Measurements],
  ['/progress/photos', Photos],
  ['/progress/journal', BodyJournal],
  ['/progress/goals', GoalsPage],
  ['/progress/calendar', CalendarPage],
  ['/progress/weekly', WeeklyReportPage],
  ['/progress/monthly', MonthlyReportPage],
  ['/profile', ProfilePage],
];

function resolve(path: string) {
  const clean = path.split('?')[0];
  for (const [pattern, C] of ROUTES) {
    const params = match(pattern, clean);
    if (params) return { C, params };
  }
  return null;
}

export default function App() {
  const status = useStore((s) => s.status);
  const profile = useStore((s) => s.data.profile);
  const path = usePath();
  useScrollTop(path.split('?')[0]);
  useEffect(() => initSync(), []);
  useAutoReports();

  if (status !== 'ready') return null;
  if (!profile) return <Onboarding />;
  const r = resolve(path);
  return (
    <AppShell path={path}>
      <Suspense fallback={<div className="h-40" />}>
        {r ? (
          <r.C params={r.params} key={path.split('?')[0]} />
        ) : (
          <div className="text-center py-20 text-muted">
            Page introuvable. <a className="text-accent" href="#/">Retour à l'accueil</a>
          </div>
        )}
      </Suspense>
    </AppShell>
  );
}
