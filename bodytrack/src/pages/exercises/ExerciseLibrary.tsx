import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { MuscleGroup } from '../../lib/types';
import { Badge, Button, Card, Chip, PageHeader } from '../../components/ui';
import { MuscleDot, normalize } from '../../components/ExercisePicker';
import { useCtx } from '../../lib/useCtx';
import { ALL_MUSCLES, MUSCLE_LABELS, exerciseRecords } from '../../lib/calc/training';
import { EQUIPMENT_LABELS, TYPE_LABELS } from '../../data/exercises';
import { navigate } from '../../lib/router';
import { ExerciseForm } from './ExerciseForm';
import { fmtSmart } from '../../lib/format';

export default function ExerciseLibrary() {
  const ctx = useCtx();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [form, setForm] = useState(false);
  const list = useMemo(() => {
    const nq = normalize(q.trim());
    return ctx.exercises
      .filter((e) => (!muscle || e.primaryMuscle === muscle || e.secondaryMuscles.includes(muscle)) && (!nq || normalize(e.name).includes(nq)) && (!onlyMine || ctx.practicedExerciseIds.has(e.id) || e.isCustom))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [ctx, q, muscle, onlyMine]);
  const grouped = ALL_MUSCLES.map((m) => ({ m, items: list.filter((e) => e.primaryMuscle === m) })).filter((g) => g.items.length);

  return (
    <div>
      <PageHeader
        title="Exercices"
        subtitle={`${ctx.exercises.length} exercices · ${ctx.practicedExerciseIds.size} pratiqués`}
        action={
          <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setForm(true)}>
            Créer
          </Button>
        }
      />
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input className="field pl-9" placeholder="Rechercher un exercice" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-3 -mx-4 px-4">
        <Chip active={onlyMine} onClick={() => setOnlyMine(!onlyMine)}>
          Mes exercices
        </Chip>
        <Chip active={!muscle} onClick={() => setMuscle(null)}>
          Tous les muscles
        </Chip>
        {ALL_MUSCLES.map((m) => (
          <Chip key={m} active={muscle === m} onClick={() => setMuscle(muscle === m ? null : m)}>
            {MUSCLE_LABELS[m]}
          </Chip>
        ))}
      </div>
      <div className="space-y-6">
        {grouped.map(({ m, items }) => (
          <section key={m}>
            <h2 className="display text-sm uppercase tracking-wider text-muted mb-2">{MUSCLE_LABELS[m]}</h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {items.map((e) => {
                const r = ctx.practicedExerciseIds.has(e.id) ? exerciseRecords(ctx.history(e.id)) : null;
                return (
                  <Card key={e.id} className="!p-3" onClick={() => navigate(`/exercises/${e.id}`)}>
                    <div className="flex items-center gap-3">
                      <MuscleDot muscle={e.primaryMuscle} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{e.name}</div>
                        <div className="text-xs text-muted truncate">
                          {TYPE_LABELS[e.type]} · {EQUIPMENT_LABELS[e.equipment]}
                        </div>
                      </div>
                      {e.isCustom && <Badge tone="info">Perso</Badge>}
                      {r?.bestE1rm && (
                        <div className="text-right">
                          <div className="text-sm font-semibold tnum">{fmtSmart(r.bestE1rm.value, 1)}</div>
                          <div className="text-[10px] text-muted">1RM est.</div>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
        {!grouped.length && <p className="text-center text-sm text-muted py-10">Aucun exercice ne correspond à ta recherche.</p>}
      </div>
      {form && <ExerciseForm onClose={() => setForm(false)} onSaved={(id) => navigate(`/exercises/${id}`)} />}
    </div>
  );
}
