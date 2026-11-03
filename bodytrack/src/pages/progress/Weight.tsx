import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { Button, Card, Delta, EmptyState, IconButton, PageHeader, ProgressBar, Segmented, Stat, SubNav } from '../../components/ui';
import { ACCENT, ChartTooltip, DataTable, Legend, axisProps, gridProps } from '../../components/charts';
import { WeightSheet } from '../../components/WeightSheet';
import { PROGRESS_NAV } from './nav';
import { useCtx, useToday } from '../../lib/useCtx';
import { cleanLogs, latestLog, movingAverage, weightGoalProgress, weightSeries } from '../../lib/calc/weight';
import { addDays, formatDate } from '../../lib/dates';
import { fmtKg, fmtSmart } from '../../lib/format';
import { store } from '../../lib/store/store';
import { confirmDialog } from '../../components/confirm';

export default function WeightPage() {
  const ctx = useCtx();
  const t = useToday();
  const p = ctx.data.profile!;
  const [open, setOpen] = useState<string | null>(null);
  const [range, setRange] = useState<'30' | '90' | '180' | '365' | 'all'>('90');
  const logs = ctx.data.weights;
  const latest = latestLog(logs);
  const avg7 = movingAverage(logs, t, 7);
  const avg30 = movingAverage(logs, t, 30);
  const from = range === 'all' ? undefined : addDays(t, -(Number(range) - 1));
  const series = useMemo(() => weightSeries(logs, from, t).map((x) => ({ ...x, label: formatDate(x.date), avg7: x.avg7 !== null ? Math.round(x.avg7 * 100) / 100 : null })), [logs, from, t]);
  const progress = weightGoalProgress(p.startWeightKg, p.targetWeightKg, avg7);
  const list = [...cleanLogs(logs)].reverse();

  return (
    <div>
      <PageHeader title="Progression" subtitle="Poids, mensurations, photos et bilans" action={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setOpen(t)}>Pesée</Button>} />
      <SubNav items={PROGRESS_NAV} active="/progress" />
      {!logs.length ? (
        <EmptyState title="Aucune pesée" text="Pèse-toi régulièrement (idéalement le matin, à jeun) : BODYTRACK calcule une moyenne sur 7 jours pour lisser les fluctuations." action={<Button variant="primary" onClick={() => setOpen(t)}>Saisir mon poids</Button>} />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <Card>
              <Stat label="Dernière pesée" value={fmtKg(latest?.weightKg)} sub={latest ? formatDate(latest.date, { weekday: 'short', day: 'numeric', month: 'short' }) : undefined} />
            </Card>
            <Card>
              <Stat label="Moyenne 7 jours" value={fmtKg(avg7, 2)} sub={<>vs 7 j avant : <Delta value={avg7 !== null && movingAverage(logs, addDays(t, -7), 7) !== null ? avg7 - movingAverage(logs, addDays(t, -7), 7)! : null} unit="kg" digits={2} invert={p.goal === 'cut'} /></>} />
            </Card>
            <Card>
              <Stat label="Moyenne 30 jours" value={fmtKg(avg30, 2)} />
            </Card>
            <Card>
              <Stat label="Poids de départ" value={fmtKg(p.startWeightKg)} />
            </Card>
            <Card>
              <Stat label="Évolution totale" value={<Delta value={avg7 !== null ? avg7 - p.startWeightKg : null} unit="kg" invert={p.goal === 'cut'} className="!text-2xl" />} sub="moyenne 7 j − départ" />
            </Card>
            <Card>
              <Stat label="Objectif" value={fmtKg(p.targetWeightKg)} sub={`${Math.round(progress)} % du chemin`} />
              <ProgressBar value={progress} max={100} className="mt-2" height={5} />
            </Card>
          </div>

          <Card className="mb-4">
            <Segmented className="w-full mb-3" size="sm" value={range} onChange={setRange} options={[{ value: '30', label: '30 j' }, { value: '90', label: '3 mois' }, { value: '180', label: '6 mois' }, { value: '365', label: '1 an' }, { value: 'all', label: 'Tout' }]} />
            <Legend items={[{ label: 'Pesée du jour', color: '#5b8fd9' }, { label: 'Moyenne mobile 7 jours', color: ACCENT }, { label: 'Objectif', color: '#8b929c', dashed: true }]} />
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" {...axisProps} minTickGap={28} />
                  <YAxis {...axisProps} domain={['dataMin - 0.5', 'dataMax + 0.5']} width={44} tickFormatter={(v: number) => fmtSmart(v, 1)} />
                  <Tooltip content={<ChartTooltip valueFormatter={(v) => `${fmtSmart(v, 2)} kg`} />} cursor={{ stroke: '#5b626b' }} />
                  <ReferenceLine y={p.targetWeightKg} stroke="#8b929c" strokeDasharray="4 4" ifOverflow="extendDomain" />
                  <Scatter dataKey="weight" name="Pesée" fill="#5b8fd9" shape={(props: { cx?: number; cy?: number }) => (props.cy ? <circle cx={props.cx} cy={props.cy} r={3} fill="#5b8fd9" fillOpacity={0.75} /> : <g />)} isAnimationActive={false} />
                  <Line dataKey="avg7" name="Moyenne 7 j" stroke={ACCENT} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-faint mt-2">L'analyse de ta progression repose sur la moyenne mobile, pas sur la dernière pesée : le poids quotidien varie avec l'eau, le sel, le glycogène et la digestion.</p>
            <DataTable columns={['Date', 'Pesée', 'Moyenne 7 j']} rows={series.filter((s) => s.weight !== null).map((s) => [s.label, s.weight!, s.avg7 ?? '—'])} />
          </Card>

          <Card className="!p-0">
            <div className="px-4 pt-3 pb-2 text-sm font-semibold">Historique des pesées</div>
            <ul className="divide-y divide-line">
              {list.slice(0, 60).map((l) => {
                const entry = logs.find((w) => w.date === l.date);
                return (
                  <li key={l.date} className="flex items-center gap-3 px-4 py-2">
                    <button type="button" className="flex-1 text-left flex items-center justify-between gap-3" onClick={() => setOpen(l.date)}>
                      <span className="text-sm first-letter:uppercase">{formatDate(l.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      <span className="text-xs text-muted truncate flex-1 text-right">{entry?.note}</span>
                      <span className="font-semibold tnum">{fmtSmart(l.weightKg, 1)} kg</span>
                    </button>
                    <IconButton
                      label="Supprimer la pesée"
                      onClick={async () => {
                        if (entry && (await confirmDialog({ title: 'Supprimer cette pesée ?', confirmLabel: 'Supprimer', danger: true }))) store().remove('weights', entry.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
      {open && <WeightSheet open onClose={() => setOpen(null)} date={open} key={open} />}
    </div>
  );
}
