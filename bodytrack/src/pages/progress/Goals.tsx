import { useEffect, useState } from 'react';
import { Apple, Calendar, CheckCircle2, Crown, Dumbbell, Flame, Lock, Medal, Plus, Scale, Target, Trash2, Trophy, Weight } from 'lucide-react';
import type { UserGoal, UserGoalType } from '../../lib/types';
import { Badge, Button, Card, EmptyState, Field, IconButton, NumberInput, PageHeader, ProgressBar, SectionTitle, Sheet, SubNav, cx } from '../../components/ui';
import { PROGRESS_NAV } from './nav';
import { useCtx, useToday } from '../../lib/useCtx';
import { ACHIEVEMENTS, achievementDates, goalProgress, trackingStreak } from '../../lib/analytics/goals';
import { MEASUREMENT_FIELDS } from '../../lib/analytics/reports';
import { epley1RM } from '../../lib/calc/training';
import { latestLog, movingAverage } from '../../lib/calc/weight';
import { formatDate } from '../../lib/dates';
import { fmtSmart, nowISO, uid } from '../../lib/format';
import { store } from '../../lib/store/store';
import { confirmDialog } from '../../components/confirm';
import { toast } from '../../components/toast';

const ICONS: Record<string, typeof Trophy> = { dumbbell: Dumbbell, flame: Flame, medal: Medal, crown: Crown, trophy: Trophy, weight: Weight, apple: Apple, scale: Scale, calendar: Calendar, target: Target };
const TYPES: { value: UserGoalType; label: string }[] = [
  { value: 'weight', label: 'Poids' },
  { value: 'strength', label: 'Force' },
  { value: 'reps', label: 'Répétitions' },
  { value: 'consistency', label: 'Régularité' },
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'measurement', label: 'Mensuration' },
];

export default function GoalsPage() {
  const ctx = useCtx();
  const t = useToday();
  const [form, setForm] = useState(false);
  const goals = ctx.data.goals;
  const dates = achievementDates(ctx);
  const streak = trackingStreak(ctx, t);

  // Enregistre la date d'atteinte d'un objectif (une seule fois)
  useEffect(() => {
    const done = goals.filter((g) => !g.achievedAt && goalProgress(ctx, g, t).achieved);
    if (done.length) {
      store().upsert('goals', done.map((g) => ({ ...g, achievedAt: nowISO() })));
      done.forEach((g) => toast('Objectif atteint !', g.title, 'record', 5000));
    }
  }, [goals, ctx, t]);

  return (
    <div>
      <PageHeader title="Objectifs" subtitle="Objectifs personnels, récompenses et régularité" action={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setForm(true)}>Objectif</Button>} />
      <SubNav items={PROGRESS_NAV} active="/progress/goals" />

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="!p-3 text-center">
          <Flame size={18} className="text-accent mx-auto" />
          <div className="display text-3xl font-bold tnum">{streak.current}</div>
          <div className="text-[11px] text-muted">jours suivis d'affilée</div>
        </Card>
        <Card className="!p-3 text-center">
          <Trophy size={18} className="text-accent mx-auto" />
          <div className="display text-3xl font-bold tnum">{streak.best}</div>
          <div className="text-[11px] text-muted">meilleure série</div>
        </Card>
        <Card className="!p-3 text-center">
          <Calendar size={18} className="text-accent mx-auto" />
          <div className="display text-3xl font-bold tnum">{streak.weeksActive}</div>
          <div className="text-[11px] text-muted">semaines actives</div>
        </Card>
      </div>
      <p className="text-[11px] text-faint -mt-4 mb-6">Un jour isolé sans saisie ne casse pas ta série (jour de repos) : seuls deux jours d'affilée sans aucune donnée la remettent à zéro.</p>

      <SectionTitle>Mes objectifs</SectionTitle>
      {!goals.length ? (
        <EmptyState icon={<Target size={22} />} title="Aucun objectif" text="Fixe un objectif de poids, de force, de répétitions, de régularité, de nutrition ou de mensuration." action={<Button variant="primary" onClick={() => setForm(true)}>Créer un objectif</Button>} />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {goals.map((g) => {
            const pr = goalProgress(ctx, g, t);
            return (
              <Card key={g.id} className={cx(pr.achieved && '!border-accent/40')}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{g.title}</span>
                      {pr.achieved && <CheckCircle2 size={16} className="text-accent" />}
                    </div>
                    <div className="text-xs text-muted">
                      {TYPES.find((x) => x.value === g.type)?.label} · {pr.detail}
                      {g.deadline && ` · échéance ${formatDate(g.deadline)}`}
                    </div>
                  </div>
                  <IconButton
                    label="Supprimer l'objectif"
                    onClick={async () => {
                      if (await confirmDialog({ title: 'Supprimer cet objectif ?', confirmLabel: 'Supprimer', danger: true })) store().remove('goals', g.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
                <div className="flex items-baseline justify-between mt-3 text-sm tnum">
                  <span>
                    <span className="display text-2xl font-bold">{pr.current !== null ? fmtSmart(pr.current, 1) : '—'}</span> <span className="text-muted">{pr.unit}</span>
                  </span>
                  <span className="text-muted">
                    objectif {fmtSmart(g.targetValue, 1)} {pr.unit}
                  </span>
                </div>
                <ProgressBar value={pr.pct} max={100} className="mt-2" />
                <div className="text-[11px] text-faint mt-1 tnum">{Math.round(pr.pct)} %{g.type !== 'consistency' && g.type !== 'nutrition' && ` · départ ${fmtSmart(g.startValue, 1)} ${pr.unit}`}</div>
              </Card>
            );
          })}
        </div>
      )}

      <SectionTitle className="mt-8">Récompenses</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {ACHIEVEMENTS.map((a) => {
          const Icon = ICONS[a.icon] ?? Trophy;
          const d = dates[a.key];
          return (
            <Card key={a.key} className={cx('!p-3 text-center', d ? '!border-accent/30' : 'opacity-60')}>
              <div className={cx('size-11 rounded-2xl mx-auto grid place-items-center', d ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-faint')}>{d ? <Icon size={20} /> : <Lock size={18} />}</div>
              <div className="text-sm font-semibold mt-2">{a.title}</div>
              <div className="text-[11px] text-muted">{a.description}</div>
              {d && <Badge tone="accent" className="mt-2">{formatDate(d, { day: 'numeric', month: 'short', year: 'numeric' })}</Badge>}
            </Card>
          );
        })}
      </div>

      {form && <GoalForm onClose={() => setForm(false)} />}
    </div>
  );
}

function GoalForm({ onClose }: { onClose: () => void }) {
  const ctx = useCtx();
  const t = useToday();
  const [type, setType] = useState<UserGoalType>('strength');
  const exercises = ctx.exercises.filter((e) => ctx.practicedExerciseIds.has(e.id)).concat(ctx.exercises.filter((e) => !ctx.practicedExerciseIds.has(e.id)));
  const [exerciseId, setExerciseId] = useState(exercises[0]?.id ?? '');
  const [metric, setMetric] = useState('e1rm');
  const [refW, setRefW] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [deadline, setDeadline] = useState('');
  const ex = ctx.exById.get(exerciseId);

  const startValue = (() => {
    if (type === 'weight') return movingAverage(ctx.data.weights, t, 7) ?? latestLog(ctx.data.weights)?.weightKg ?? ctx.data.profile?.startWeightKg ?? 0;
    if (type === 'strength') {
      let best = 0;
      for (const p of ctx.history(exerciseId)) for (const s of p.sets) best = Math.max(best, metric === 'weight' ? s.weightKg : (epley1RM(s.weightKg, s.reps) ?? 0));
      return Math.round(best * 10) / 10;
    }
    if (type === 'reps') {
      let best = 0;
      for (const p of ctx.history(exerciseId)) for (const s of p.sets) if (s.weightKg >= (refW ?? 0)) best = Math.max(best, s.reps);
      return best;
    }
    if (type === 'measurement') {
      const ms = ctx.data.measurements.filter((m) => m[metric as 'waistCm'] !== null).sort((a, b) => b.date.localeCompare(a.date));
      return ms[0]?.[metric as 'waistCm'] ?? 0;
    }
    return 0;
  })();

  const title = (() => {
    const v = target !== null ? fmtSmart(target, 1) : '…';
    switch (type) {
      case 'weight': return `Atteindre ${v} kg`;
      case 'strength': return `${ex?.name ?? ''} : ${metric === 'weight' ? 'charge de' : '1RM estimé de'} ${v} kg`;
      case 'reps': return `${ex?.name ?? ''} : ${v} reps à ${fmtSmart(refW ?? 0, 1)} kg`;
      case 'consistency': return `${v} séances par semaine`;
      case 'nutrition': return metric === 'protein_days' ? `Objectif protéique ${v} jours sur 30` : `Journal saisi ${v} jours sur 30`;
      case 'measurement': return `${MEASUREMENT_FIELDS.find((f) => f.key === metric)?.label ?? ''} : ${v} cm`;
    }
  })();

  const valid = target !== null && target > 0 && (type !== 'reps' || refW !== null) && ((type !== 'strength' && type !== 'reps') || !!exerciseId);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Nouvel objectif"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => {
              const g: UserGoal = { id: uid(), type, title, exerciseId: type === 'strength' || type === 'reps' ? exerciseId : null, metric, referenceWeightKg: type === 'reps' ? refW : null, startValue, targetValue: target!, deadline: deadline || null, createdAt: nowISO(), achievedAt: null, updatedAt: nowISO() };
              store().upsert('goals', g);
              toast('Objectif créé', title);
              onClose();
            }}
          >
            Créer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-1.5">
          {TYPES.map((x) => (
            <button
              key={x.value}
              type="button"
              onClick={() => {
                setType(x.value);
                setMetric(x.value === 'strength' ? 'e1rm' : x.value === 'nutrition' ? 'protein_days' : x.value === 'measurement' ? 'waistCm' : x.value === 'weight' ? 'avg7' : 'sessions_per_week');
                setTarget(null);
              }}
              className={cx('h-10 rounded-xl border text-sm', type === x.value ? 'border-accent text-accent bg-accent/10' : 'border-line text-muted')}
            >
              {x.label}
            </button>
          ))}
        </div>
        {(type === 'strength' || type === 'reps') && (
          <Field label="Exercice">
            <select className="field" value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
              {exercises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {type === 'strength' && (
          <Field label="Mesure">
            <select className="field" value={metric} onChange={(e) => setMetric(e.target.value)}>
              <option value="e1rm">1RM estimé (Epley)</option>
              <option value="weight">Charge maximale réalisée</option>
            </select>
          </Field>
        )}
        {type === 'reps' && (
          <Field label="Charge de référence">
            <NumberInput value={refW} onChange={setRefW} suffix="kg" />
          </Field>
        )}
        {type === 'nutrition' && (
          <Field label="Mesure">
            <select className="field" value={metric} onChange={(e) => setMetric(e.target.value)}>
              <option value="protein_days">Jours avec objectif protéique atteint (sur 30)</option>
              <option value="logged_days">Jours avec journal saisi (sur 30)</option>
            </select>
          </Field>
        )}
        {type === 'measurement' && (
          <Field label="Mensuration">
            <select className="field" value={metric} onChange={(e) => setMetric(e.target.value)}>
              {MEASUREMENT_FIELDS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valeur cible" hint={type !== 'consistency' && type !== 'nutrition' ? `Actuel : ${fmtSmart(startValue, 1)}` : undefined}>
            <NumberInput value={target} onChange={setTarget} />
          </Field>
          <Field label="Échéance (facultatif)">
            <input type="date" className="field" value={deadline} min={t} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
        <div className="rounded-xl bg-surface-2 px-3 py-2 text-sm">{title}</div>
      </div>
    </Sheet>
  );
}
