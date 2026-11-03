import { useState } from 'react';
import type { Equipment, Exercise, ExerciseType, MuscleGroup } from '../../lib/types';
import { Button, Chip, Field, NumberInput, Sheet } from '../../components/ui';
import { ALL_MUSCLES, MUSCLE_LABELS } from '../../lib/calc/training';
import { EQUIPMENT_LABELS, TYPE_LABELS } from '../../data/exercises';
import { store } from '../../lib/store/store';
import { nowISO, uid } from '../../lib/format';
import { toast } from '../../components/toast';

export function ExerciseForm({ initial, onClose, onSaved }: { initial?: Exercise; onClose: () => void; onSaved?: (id: string) => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [primary, setPrimary] = useState<MuscleGroup>(initial?.primaryMuscle ?? 'chest');
  const [secondary, setSecondary] = useState<MuscleGroup[]>(initial?.secondaryMuscles ?? []);
  const [type, setType] = useState<ExerciseType>(initial?.type ?? 'compound');
  const [equipment, setEquipment] = useState<Equipment>(initial?.equipment ?? 'barbell');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [instructions, setInstructions] = useState((initial?.instructions ?? []).join('\n'));
  const [rest, setRest] = useState<number | null>(initial?.defaultRestSec ?? 90);
  const [inc, setInc] = useState<number | null>(initial?.loadIncrementKg ?? 2.5);
  const valid = name.trim().length >= 2;
  const save = () => {
    if (!valid) return;
    const ex: Exercise = {
      id: initial?.id ?? `custom-${uid()}`,
      name: name.trim(),
      primaryMuscle: primary,
      secondaryMuscles: secondary.filter((m) => m !== primary),
      type,
      equipment,
      description: description.trim(),
      instructions: instructions.split('\n').map((s) => s.trim()).filter(Boolean),
      defaultRestSec: Math.max(15, Math.min(600, rest ?? 90)),
      loadIncrementKg: Math.max(0, Math.min(20, inc ?? 2.5)),
      isCustom: true,
      updatedAt: nowISO(),
    };
    store().upsert('exercises', ex);
    toast(initial ? 'Exercice modifié' : 'Exercice créé', ex.name);
    onSaved?.(ex.id);
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={initial ? 'Modifier l\'exercice' : 'Nouvel exercice'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={save} disabled={!valid}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nom">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Ex. : Développé décliné" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Muscle principal">
            <select className="field" value={primary} onChange={(e) => setPrimary(e.target.value as MuscleGroup)}>
              {ALL_MUSCLES.map((m) => (
                <option key={m} value={m}>
                  {MUSCLE_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select className="field" value={type} onChange={(e) => setType(e.target.value as ExerciseType)}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div>
          <span className="label">Muscles secondaires</span>
          <div className="flex flex-wrap gap-1.5">
            {ALL_MUSCLES.filter((m) => m !== primary).map((m) => (
              <Chip key={m} active={secondary.includes(m)} onClick={() => setSecondary(secondary.includes(m) ? secondary.filter((x) => x !== m) : [...secondary, m])}>
                {MUSCLE_LABELS[m]}
              </Chip>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Matériel">
            <select className="field" value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
              {Object.entries(EQUIPMENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Repos (s)">
            <NumberInput value={rest} onChange={setRest} inputMode="numeric" step={1} />
          </Field>
          <Field label="Incrément (kg)">
            <NumberInput value={inc} onChange={setInc} />
          </Field>
        </div>
        <Field label="Description">
          <textarea className="field min-h-16" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} />
        </Field>
        <Field label="Consignes d'exécution (une par ligne)">
          <textarea className="field min-h-24" value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={1500} />
        </Field>
      </div>
    </Sheet>
  );
}
