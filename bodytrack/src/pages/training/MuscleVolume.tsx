import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, IconButton, Notice, PageHeader, SubNav } from '../../components/ui';
import { ChartTooltip, DataTable, Legend, SERIES, axisProps, gridProps } from '../../components/charts';
import { useCtx, useToday } from '../../lib/useCtx';
import { TRAINING_NAV } from './TrainingHome';
import { weeklyMuscleVolume } from '../../lib/analytics/stats';
import { MUSCLE_LABELS } from '../../lib/calc/training';
import { addDays, formatDate, startOfWeek } from '../../lib/dates';
import { fmtSmart } from '../../lib/format';

export default function MuscleVolumePage() {
  const ctx = useCtx();
  const t = useToday();
  const [week, setWeek] = useState(startOfWeek(t));
  const rows = useMemo(() => weeklyMuscleVolume(ctx, week).map((r) => ({ ...r, label: MUSCLE_LABELS[r.muscle] })), [ctx, week]);
  // Moyenne des 4 semaines précédentes, pour situer la semaine affichée
  const avg4 = useMemo(() => {
    const acc = new Map<string, number>();
    for (let i = 1; i <= 4; i++) for (const r of weeklyMuscleVolume(ctx, addDays(week, -7 * i))) acc.set(r.muscle, (acc.get(r.muscle) ?? 0) + r.weighted / 4);
    return acc;
  }, [ctx, week]);
  const total = rows.reduce((a, r) => a + r.direct, 0);
  const max = Math.max(...rows.map((r) => r.weighted));
  const low = rows.filter((r) => max >= 6 && r.weighted < max * 0.4);

  return (
    <div>
      <PageHeader title="Volume musculaire" subtitle="Séries de travail par groupe musculaire et par semaine" />
      <SubNav items={TRAINING_NAV} active="/training/volume" />
      <div className="flex items-center justify-between mb-4">
        <IconButton label="Semaine précédente" onClick={() => setWeek(addDays(week, -7))}>
          <ChevronLeft size={20} />
        </IconButton>
        <div className="text-center">
          <div className="text-sm font-semibold">
            Semaine du {formatDate(week)} au {formatDate(addDays(week, 6))}
          </div>
          <div className="text-xs text-muted">{total} séries directes</div>
        </div>
        <IconButton label="Semaine suivante" onClick={() => setWeek(addDays(week, 7))} disabled={week >= startOfWeek(t)}>
          <ChevronRight size={20} />
        </IconButton>
      </div>
      <Card>
        <Legend items={[{ label: 'Séries directes (muscle principal)', color: SERIES[0] }, { label: 'Séries secondaires (comptées pour moitié dans le total)', color: SERIES[1] }]} />
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }} barCategoryGap={6}>
              <CartesianGrid {...gridProps} horizontal={false} vertical />
              <XAxis type="number" {...axisProps} allowDecimals={false} />
              <YAxis type="category" dataKey="label" {...axisProps} width={92} />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => `${fmtSmart(v, 1)} séries`} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="direct" name="Directes" stackId="a" fill={SERIES[0]} stroke="var(--color-surface)" strokeWidth={2} />
              <Bar dataKey="secondary" name="Secondaires" stackId="a" fill={SERIES[1]} stroke="var(--color-surface)" strokeWidth={2} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <DataTable
          columns={['Muscle', 'Directes', 'Secondaires', 'Total équivalent', 'Moy. 4 sem. préc.']}
          rows={rows.map((r) => [r.label, r.direct, r.secondary, fmtSmart(r.weighted, 1), fmtSmart(avg4.get(r.muscle) ?? 0, 1)])}
        />
      </Card>
      <div className="mt-4 space-y-3">
        {low.length > 0 && (
          <Notice tone="warn">
            Groupes nettement moins travaillés cette semaine : {low.map((l) => `${l.label.toLowerCase()} (${fmtSmart(l.weighted, 1)})`).join(', ')}. Ton groupe le plus travaillé totalise {fmtSmart(max, 1)} séries équivalentes.
          </Notice>
        )}
        <Notice>Une série directe compte 1 pour le muscle principal de l'exercice ; chaque muscle secondaire reçoit une contribution de 0,5 dans le total équivalent. Ces repères aident à équilibrer ton programme, ils ne constituent pas une norme.</Notice>
      </div>
    </div>
  );
}
