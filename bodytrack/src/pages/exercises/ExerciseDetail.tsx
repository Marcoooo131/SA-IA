import { useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Button, Card, Delta, EmptyState, Notice, PageHeader, SectionTitle, Segmented, Stat } from '../../components/ui';
import { ACCENT, ChartTooltip, DataTable, Legend, SERIES, axisProps, gridProps } from '../../components/charts';
import { MuscleDot } from '../../components/ExercisePicker';
import { useCtx, useToday } from '../../lib/useCtx';
import { exerciseRecords, isStagnating, MUSCLE_LABELS } from '../../lib/calc/training';
import { EQUIPMENT_LABELS, TYPE_LABELS } from '../../data/exercises';
import { addDays, addMonths, formatDate } from '../../lib/dates';
import { fmt, fmtSmart } from '../../lib/format';
import { ExerciseForm } from './ExerciseForm';
import { store } from '../../lib/store/store';
import { confirmDialog } from '../../components/confirm';
import { navigate } from '../../lib/router';

const PERIODS = [
  { key: '7d', label: '7 j', from: (t: string) => addDays(t, -6) },
  { key: '30d', label: '30 j', from: (t: string) => addDays(t, -29) },
  { key: '3m', label: '3 mois', from: (t: string) => addMonths(t, -3) },
  { key: '6m', label: '6 mois', from: (t: string) => addMonths(t, -6) },
  { key: '1y', label: '1 an', from: (t: string) => addMonths(t, -12) },
  { key: 'all', label: 'Tout', from: () => '0000-01-01' },
] as const;

export default function ExerciseDetail({ params }: { params: Record<string, string> }) {
  const ctx = useCtx();
  const t = useToday();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['key']>('3m');
  const [edit, setEdit] = useState(false);
  const ex = ctx.exById.get(params.id);
  const history = useMemo(() => ctx.history(params.id), [ctx, params.id]);
  if (!ex) return <EmptyState title="Exercice introuvable" action={<Button onClick={() => navigate('/exercises')}>Retour</Button>} />;
  const rec = exerciseRecords(history);
  const from = PERIODS.find((p) => p.key === period)!.from(t);
  const inPeriod = history.filter((p) => p.date >= from);
  const chart = inPeriod.map((p) => ({ date: p.date, label: formatDate(p.date), e1rm: p.bestE1rm !== null ? Math.round(p.bestE1rm * 10) / 10 : null, weight: p.bestWeight || null, reps: p.maxReps, volume: Math.round(p.volume) }));
  const bodyweight = history.length > 0 && history.every((p) => p.bestWeight === 0);

  /** Progression sur chaque période : meilleure valeur de la période vs première séance de la période */
  const progress = PERIODS.slice(0, 5).map((p) => {
    const f = p.from(t);
    const pts = history.filter((h) => h.date >= f);
    if (pts.length < 2) return { ...p, delta: null as number | null, pct: null as number | null, n: pts.length };
    const metric = (h: (typeof pts)[number]) => (bodyweight ? h.maxReps : (h.bestE1rm ?? 0));
    const first = metric(pts[0]);
    const best = Math.max(...pts.slice(1).map(metric));
    const lastV = metric(pts[pts.length - 1]);
    return { ...p, delta: lastV - first, pct: first ? ((best - first) / first) * 100 : null, n: pts.length };
  });

  return (
    <div>
      <PageHeader
        title={ex.name}
        backTo="/exercises"
        action={
          ex.isCustom && (
            <>
              <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEdit(true)}>
                Modifier
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 size={14} />}
                onClick={async () => {
                  if (await confirmDialog({ title: 'Supprimer cet exercice ?', text: history.length ? 'Ton historique sur cet exercice sera conservé mais il n\'apparaîtra plus dans la bibliothèque.' : undefined, confirmLabel: 'Supprimer', danger: true })) {
                    store().remove('exercises', ex.id);
                    navigate('/exercises', { replace: true });
                  }
                }}
              />
            </>
          )
        }
      />

      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-4">
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <MuscleDot muscle={ex.primaryMuscle} size={48} />
            <div>
              <div className="font-semibold">{MUSCLE_LABELS[ex.primaryMuscle]}</div>
              <div className="text-xs text-muted">
                {TYPE_LABELS[ex.type]} · {EQUIPMENT_LABELS[ex.equipment]} · repos {Math.round(ex.defaultRestSec / 60 * 10) / 10} min
              </div>
            </div>
          </div>
          {ex.secondaryMuscles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {ex.secondaryMuscles.map((m) => (
                <Badge key={m}>{MUSCLE_LABELS[m]}</Badge>
              ))}
            </div>
          )}
          {ex.description && <p className="text-sm text-muted">{ex.description}</p>}
          {ex.instructions.length > 0 && (
            <>
              <div className="label mt-4">Consignes d'exécution</div>
              <ol className="space-y-2">
                {ex.instructions.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-sm">
                    <span className="size-5 shrink-0 rounded-full bg-surface-3 text-[11px] grid place-items-center font-bold text-muted">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="!p-3">
              <Stat label="Meilleure charge" value={rec.bestWeight ? `${fmtSmart(rec.bestWeight.value, 2)} kg` : '—'} sub={rec.bestWeight ? `× ${rec.bestWeight.reps} · ${formatDate(rec.bestWeight.date)}` : undefined} />
            </Card>
            <Card className="!p-3">
              <Stat label="Max. de reps" value={rec.maxReps ? fmt(rec.maxReps.value) : '—'} sub={rec.maxReps ? `à ${fmtSmart(rec.maxReps.weightKg, 2)} kg` : undefined} />
            </Card>
            <Card className="!p-3">
              <Stat label="1RM estimé" value={rec.bestE1rm ? `${fmtSmart(rec.bestE1rm.value, 1)} kg` : '—'} sub={rec.bestE1rm ? `${fmtSmart(rec.bestE1rm.weightKg, 2)} × ${rec.bestE1rm.reps}` : undefined} />
            </Card>
            <Card className="!p-3">
              <Stat label="Volume total" value={`${fmt(rec.totalVolume)} kg`} sub={`${rec.sessions} séance${rec.sessions > 1 ? 's' : ''}`} />
            </Card>
          </div>
          {isStagnating(history) && <Notice tone="warn">Pas de progression sur les 3 dernières séances : vérifie ta récupération et envisage de varier la fourchette de répétitions.</Notice>}
        </div>
      </div>

      {history.length ? (
        <>
          <section className="mt-6">
            <SectionTitle>Progression</SectionTitle>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {progress.map((p) => (
                <Card key={p.key} className="!p-2.5 text-center">
                  <div className="text-[10px] uppercase text-muted">{p.label}</div>
                  <div className="text-sm mt-0.5">{p.pct === null ? <span className="text-faint">—</span> : <Delta value={p.pct} unit="%" />}</div>
                  <div className="text-[10px] text-faint">{p.n} séance{p.n > 1 ? 's' : ''}</div>
                </Card>
              ))}
            </div>
            <p className="text-[11px] text-faint -mt-2 mb-4">Meilleur {bodyweight ? 'nombre de répétitions' : '1RM estimé'} de la période comparé à la première séance de la période.</p>
            <Segmented className="w-full mb-3" size="sm" value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p.key, label: p.label }))} />
            <Card>
              {chart.length ? (
                <>
                  <Legend items={bodyweight ? [{ label: 'Répétitions max.', color: ACCENT }] : [{ label: '1RM estimé', color: SERIES[0] }, { label: 'Charge max.', color: SERIES[1] }]} />
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey="label" {...axisProps} minTickGap={24} />
                        <YAxis {...axisProps} domain={['auto', 'auto']} width={44} />
                        <Tooltip content={<ChartTooltip valueFormatter={(v, n) => (n.includes('Rép') ? `${v} reps` : `${fmtSmart(v, 1)} kg`)} />} cursor={{ stroke: '#5b626b' }} />
                        {bodyweight ? (
                          <Line dataKey="reps" name="Répétitions max." stroke={ACCENT} strokeWidth={2} dot={{ r: 4, fill: ACCENT, strokeWidth: 2, stroke: 'var(--color-surface)' }} />
                        ) : (
                          <>
                            <Line dataKey="e1rm" name="1RM estimé" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4, fill: SERIES[0], strokeWidth: 2, stroke: 'var(--color-surface)' }} connectNulls />
                            <Line dataKey="weight" name="Charge max." stroke={SERIES[1]} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 4, fill: SERIES[1], strokeWidth: 2, stroke: 'var(--color-surface)' }} connectNulls />
                          </>
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-xs text-muted mt-4 mb-1">Volume par séance (kg)</div>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chart} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey="label" {...axisProps} minTickGap={24} />
                        <YAxis {...axisProps} width={44} />
                        <Tooltip content={<ChartTooltip valueFormatter={(v) => `${fmt(v)} kg`} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                        <Bar dataKey="volume" name="Volume" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={22} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <DataTable columns={['Date', '1RM est.', 'Charge max.', 'Reps max.', 'Volume']} rows={chart.map((c) => [c.label, c.e1rm ?? '—', c.weight ?? '—', c.reps, c.volume])} />
                </>
              ) : (
                <p className="text-sm text-muted py-8 text-center">Aucune séance sur cette période.</p>
              )}
            </Card>
          </section>

          <section className="mt-6">
            <SectionTitle>Historique des séances</SectionTitle>
            <div className="space-y-2">
              {[...history].reverse().slice(0, 40).map((p) => (
                <Card key={p.sessionId} className="!p-3" onClick={() => navigate(`/training/session/${p.sessionId}`)}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-medium">{formatDate(p.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span className="text-muted tnum">{fmt(p.volume)} kg</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {p.sets.map((s, i) => (
                      <span key={i} className="text-xs tnum rounded-lg bg-surface-2 px-2 py-1">
                        {fmtSmart(s.weightKg, 2)} × {s.reps}
                      </span>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="mt-6">
          <EmptyState title="Pas encore d'historique" text="Ajoute cet exercice à une séance : ses statistiques et graphiques apparaîtront ici." />
        </div>
      )}
      {edit && <ExerciseForm initial={ex} onClose={() => setEdit(false)} />}
    </div>
  );
}
