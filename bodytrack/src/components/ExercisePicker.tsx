import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { MuscleGroup } from '../lib/types';
import { Chip, Sheet, cx } from './ui';
import { useCtx } from '../lib/useCtx';
import { ALL_MUSCLES, MUSCLE_LABELS } from '../lib/calc/training';
import { EQUIPMENT_LABELS } from '../data/exercises';

export function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Sélecteur d'exercice (recherche + filtre par groupe musculaire) */
export function ExercisePicker({ open, onClose, onPick, title = 'Ajouter un exercice', onCreate }: { open: boolean; onClose: () => void; onPick: (id: string) => void; title?: string; onCreate?: () => void }) {
  const ctx = useCtx();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const list = useMemo(() => {
    const nq = normalize(q.trim());
    return ctx.exercises
      .filter((e) => (!muscle || e.primaryMuscle === muscle) && (!nq || normalize(e.name).includes(nq)))
      .sort((a, b) => Number(ctx.practicedExerciseIds.has(b.id)) - Number(ctx.practicedExerciseIds.has(a.id)) || a.name.localeCompare(b.name, 'fr'));
  }, [ctx, q, muscle]);
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input className="field pl-9" placeholder="Rechercher un exercice" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-2">
        <Chip active={!muscle} onClick={() => setMuscle(null)}>
          Tous
        </Chip>
        {ALL_MUSCLES.map((m) => (
          <Chip key={m} active={muscle === m} onClick={() => setMuscle(m)}>
            {MUSCLE_LABELS[m]}
          </Chip>
        ))}
      </div>
      <ul className="divide-y divide-line">
        {list.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onPick(e.id)} className="w-full text-left py-2.5 flex items-center gap-3 hover:bg-surface-2 rounded-lg px-2 -mx-2">
              <MuscleDot muscle={e.primaryMuscle} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{e.name}</span>
                <span className="block text-xs text-muted">
                  {MUSCLE_LABELS[e.primaryMuscle]} · {EQUIPMENT_LABELS[e.equipment]}
                  {e.isCustom && ' · Personnalisé'}
                </span>
              </span>
              <Plus size={16} className="text-accent" />
            </button>
          </li>
        ))}
        {!list.length && <li className="py-6 text-center text-sm text-muted">Aucun exercice trouvé.</li>}
      </ul>
      {onCreate && (
        <button type="button" onClick={onCreate} className="mt-3 text-sm text-accent">
          + Créer un exercice personnalisé
        </button>
      )}
    </Sheet>
  );
}

const MUSCLE_HUES: Record<MuscleGroup, string> = {
  chest: '#2efc86', back: '#60a5fa', shoulders: '#fbbf24', biceps: '#f472b6', triceps: '#c084fc',
  quads: '#34d399', hamstrings: '#fb923c', glutes: '#f87171', calves: '#a3e635', abs: '#22d3ee',
};

/** Pastille de groupe musculaire (toujours accompagnée du nom du muscle) */
export function MuscleDot({ muscle, size = 36 }: { muscle: MuscleGroup; size?: number }) {
  return (
    <span className={cx('shrink-0 rounded-xl grid place-items-center display font-bold text-xs')} style={{ width: size, height: size, background: `${MUSCLE_HUES[muscle]}1f`, color: MUSCLE_HUES[muscle] }} aria-hidden>
      {MUSCLE_LABELS[muscle].slice(0, 2).toUpperCase()}
    </span>
  );
}
