import { useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Play, Plus, Trash2 } from 'lucide-react';
import type { ProgramDay, ProgramExercise, WorkoutProgram } from '../../lib/types';
import { Button, Card, EmptyState, Field, IconButton, NumberInput, PageHeader, Toggle } from '../../components/ui';
import { ExercisePicker, MuscleDot } from '../../components/ExercisePicker';
import { useCtx } from '../../lib/useCtx';
import { store } from '../../lib/store/store';
import { uid } from '../../lib/format';
import { weekdayName } from '../../lib/dates';
import { setActiveProgram, startSession } from '../../lib/actions';
import { navigate } from '../../lib/router';
import { confirmDialog } from '../../components/confirm';
import { REST_OPTIONS } from './restOptions';

export default function ProgramEditor({ params }: { params: Record<string, string> }) {
  const ctx = useCtx();
  const program = ctx.data.programs.find((p) => p.id === params.id);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  if (!program) return <EmptyState title="Programme introuvable" action={<Button onClick={() => navigate('/training')}>Retour</Button>} />;

  const save = (p: WorkoutProgram) => store().upsert('programs', p);
  const setDay = (dayId: string, patch: Partial<ProgramDay>) => save({ ...program, days: program.days.map((d) => (d.id === dayId ? { ...d, ...patch } : d)) });
  const setEx = (day: ProgramDay, exId: string, patch: Partial<ProgramExercise>) => setDay(day.id, { exercises: day.exercises.map((e) => (e.id === exId ? { ...e, ...patch } : e)) });
  const move = <T,>(arr: T[], i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return arr;
    const a = [...arr];
    [a[i], a[j]] = [a[j], a[i]];
    return a;
  };

  return (
    <div>
      <PageHeader title="Programme" subtitle="Les modifications sont enregistrées automatiquement" backTo="/training" />
      <div className="space-y-4">
        <Card className="space-y-3">
          <Field label="Nom du programme">
            <input className="field" value={program.name} onChange={(e) => save({ ...program, name: e.target.value })} maxLength={60} />
          </Field>
          <Field label="Description">
            <textarea className="field min-h-16" value={program.description} onChange={(e) => save({ ...program, description: e.target.value })} maxLength={300} />
          </Field>
          <Toggle checked={program.isActive} onChange={(v) => setActiveProgram(v ? program.id : null)} label="Programme actif" hint="Utilisé pour planifier la prochaine séance et suggérer les progressions" />
        </Card>

        {program.days.map((day, di) => (
          <Card key={day.id} className="space-y-3">
            <div className="flex items-end gap-2">
              <Field label={`Séance ${di + 1}`} className="flex-1">
                <input className="field" value={day.name} onChange={(e) => setDay(day.id, { name: e.target.value })} maxLength={40} />
              </Field>
              <Field label="Jour" className="w-32">
                <select className="field" value={day.weekday ?? ''} onChange={(e) => setDay(day.id, { weekday: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Rotation</option>
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>
                      {weekdayName(n)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-1">
              <IconButton label="Monter la séance" onClick={() => save({ ...program, days: move(program.days, di, -1) })} disabled={di === 0}>
                <ArrowUp size={16} />
              </IconButton>
              <IconButton label="Descendre la séance" onClick={() => save({ ...program, days: move(program.days, di, 1) })} disabled={di === program.days.length - 1}>
                <ArrowDown size={16} />
              </IconButton>
              <IconButton label="Dupliquer la séance" onClick={() => save({ ...program, days: [...program.days.slice(0, di + 1), { ...day, id: uid(), name: `${day.name} (copie)`, exercises: day.exercises.map((e) => ({ ...e, id: uid() })) }, ...program.days.slice(di + 1)] })}>
                <Copy size={16} />
              </IconButton>
              <IconButton
                label="Supprimer la séance"
                onClick={async () => {
                  if (await confirmDialog({ title: `Supprimer « ${day.name} » ?`, confirmLabel: 'Supprimer', danger: true })) save({ ...program, days: program.days.filter((d) => d.id !== day.id) });
                }}
              >
                <Trash2 size={16} />
              </IconButton>
              <div className="flex-1" />
              <Button
                size="sm"
                variant="outline"
                icon={<Play size={14} />}
                disabled={!day.exercises.length}
                onClick={() => {
                  if (ctx.activeSession) return navigate(`/training/session/${ctx.activeSession.id}`);
                  navigate(`/training/session/${startSession({ programId: program.id, dayId: day.id })}`);
                }}
              >
                Démarrer
              </Button>
            </div>

            <div className="space-y-2">
              {day.exercises.map((pe, ei) => {
                const ex = ctx.exById.get(pe.exerciseId);
                return (
                  <div key={pe.id} className="rounded-xl bg-surface-2 p-3">
                    <div className="flex items-center gap-2">
                      {ex && <MuscleDot muscle={ex.primaryMuscle} size={30} />}
                      <span className="flex-1 min-w-0 text-sm font-medium truncate">{ex?.name ?? 'Exercice supprimé'}</span>
                      <IconButton label="Monter" onClick={() => setDay(day.id, { exercises: move(day.exercises, ei, -1) })} disabled={ei === 0} className="size-8">
                        <ArrowUp size={14} />
                      </IconButton>
                      <IconButton label="Descendre" onClick={() => setDay(day.id, { exercises: move(day.exercises, ei, 1) })} disabled={ei === day.exercises.length - 1} className="size-8">
                        <ArrowDown size={14} />
                      </IconButton>
                      <IconButton label="Retirer" onClick={() => setDay(day.id, { exercises: day.exercises.filter((e) => e.id !== pe.id) })} className="size-8">
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                    <div className="grid grid-cols-5 gap-2 mt-2">
                      <Field label="Séries">
                        <NumberInput value={pe.sets} onChange={(v) => setEx(day, pe.id, { sets: Math.max(1, Math.min(12, v ?? 1)) })} inputMode="numeric" step={1} />
                      </Field>
                      <Field label="Reps min">
                        <NumberInput value={pe.repMin} onChange={(v) => setEx(day, pe.id, { repMin: Math.max(1, v ?? 1) })} inputMode="numeric" step={1} />
                      </Field>
                      <Field label="Reps max">
                        <NumberInput value={pe.repMax} onChange={(v) => setEx(day, pe.id, { repMax: Math.max(pe.repMin, v ?? pe.repMin) })} inputMode="numeric" step={1} />
                      </Field>
                      <Field label="Charge">
                        <NumberInput value={pe.targetWeightKg ?? null} onChange={(v) => setEx(day, pe.id, { targetWeightKg: v })} placeholder="kg" />
                      </Field>
                      <Field label="Repos">
                        <select className="field !px-1.5" value={pe.restSec} onChange={(e) => setEx(day, pe.id, { restSec: Number(e.target.value) })}>
                          {REST_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </div>
                );
              })}
              <Button variant="ghost" size="sm" className="w-full border border-dashed border-line" icon={<Plus size={14} />} onClick={() => setPickerFor(day.id)}>
                Ajouter un exercice
              </Button>
            </div>
          </Card>
        ))}

        <Button variant="secondary" className="w-full" icon={<Plus size={16} />} onClick={() => save({ ...program, days: [...program.days, { id: uid(), name: `Séance ${String.fromCharCode(65 + program.days.length)}`, weekday: null, exercises: [] }] })}>
          Ajouter une séance au programme
        </Button>
      </div>

      <ExercisePicker
        open={!!pickerFor}
        onClose={() => setPickerFor(null)}
        onPick={(exerciseId) => {
          const day = program.days.find((d) => d.id === pickerFor);
          const ex = ctx.exById.get(exerciseId);
          if (day && ex) setDay(day.id, { exercises: [...day.exercises, { id: uid(), exerciseId, sets: 3, repMin: ex.type === 'compound' ? 6 : 10, repMax: ex.type === 'compound' ? 10 : 15, restSec: ex.defaultRestSec, targetWeightKg: null }] });
          setPickerFor(null);
        }}
      />
    </div>
  );
}
