import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, PageHeader, Segmented, Stat, SubNav } from '../../components/ui';
import { ACCENT, ChartTooltip, DataTable, Legend, SERIES, axisProps, gridProps } from '../../components/charts';
import { NUTRITION_NAV } from './Journal';
import { useCtx, useToday } from '../../lib/useCtx';
import { nutritionAverages } from '../../lib/analytics/stats';
import { addDays, daysInRange, formatDate } from '../../lib/dates';
import { fmt, fmtSmart } from '../../lib/format';

export default function NutritionTrends() {
  const ctx = useCtx();
  const t = useToday();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const from = addDays(t, -(Number(days) - 1));
  const avg = nutritionAverages(ctx, from, t);
  const data = useMemo(
    () =>
      daysInRange(from, t).map((d) => {
        const logged = ctx.loggedDates.has(d);
        const tot = ctx.dayTotals(d);
        const g = ctx.goalOn(d);
        return { date: d, label: formatDate(d), kcal: logged ? Math.round(tot.kcal) : null, protein: logged ? Math.round(tot.protein) : null, targetKcal: g?.calories ?? null, targetProtein: g?.proteinG ?? null };
      }),
    [ctx, from, t],
  );
  const totalKcal = (avg.avgProtein ?? 0) * 4 + (avg.avgCarbs ?? 0) * 4 + (avg.avgFat ?? 0) * 9;
  const split = totalKcal ? [((avg.avgProtein ?? 0) * 4) / totalKcal, ((avg.avgCarbs ?? 0) * 4) / totalKcal, ((avg.avgFat ?? 0) * 9) / totalKcal] : null;

  return (
    <div>
      <PageHeader title="Tendances" subtitle="Moyennes calculées sur les jours saisis uniquement" />
      <SubNav items={NUTRITION_NAV} active="/nutrition/trends" />
      <Segmented className="w-full mb-4" value={days} onChange={setDays} options={[{ value: '7', label: '7 jours' }, { value: '30', label: '30 jours' }, { value: '90', label: '90 jours' }]} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <Stat label="Calories moyennes" value={fmt(avg.avgKcal)} sub={avg.avgTargetKcal ? `objectif ${fmt(avg.avgTargetKcal)}` : undefined} />
        </Card>
        <Card>
          <Stat label="Protéines moyennes" value={`${fmt(avg.avgProtein)} g`} sub={avg.avgTargetProtein ? `objectif ${fmt(avg.avgTargetProtein)} g` : undefined} />
        </Card>
        <Card>
          <Stat label="Jours saisis" value={`${avg.loggedDays} / ${avg.days}`} sub={`${Math.round((avg.loggedDays / avg.days) * 100)} % de régularité`} />
        </Card>
        <Card>
          <Stat label="Dans l'objectif" value={`${avg.kcalOnTargetDays} j`} sub={`calories à ± 10 % · protéines ≥ 90 % : ${avg.proteinOnTargetDays} j`} />
        </Card>
      </div>
      <Card className="mb-4">
        <div className="text-sm font-semibold mb-2">Calories par jour</div>
        <Legend items={[{ label: 'Consommées', color: ACCENT }, { label: 'Objectif', color: '#8b929c', dashed: true }]} />
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} minTickGap={20} />
              <YAxis {...axisProps} width={48} />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => `${fmt(v)} kcal`} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="kcal" name="Consommées" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={20} />
              <Line dataKey="targetKcal" name="Objectif" stroke="#8b929c" strokeDasharray="4 4" dot={false} strokeWidth={2} type="stepAfter" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card className="mb-4">
        <div className="text-sm font-semibold mb-2">Protéines par jour (g)</div>
        <Legend items={[{ label: 'Consommées', color: SERIES[0] }, { label: 'Objectif', color: '#8b929c', dashed: true }]} />
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} minTickGap={20} />
              <YAxis {...axisProps} width={48} />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => `${fmt(v)} g`} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="protein" name="Consommées" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={20} />
              <Line dataKey="targetProtein" name="Objectif" stroke="#8b929c" strokeDasharray="4 4" dot={false} strokeWidth={2} type="stepAfter" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <DataTable columns={['Date', 'kcal', 'Objectif kcal', 'Protéines', 'Objectif prot.']} rows={data.map((d) => [d.label, d.kcal ?? '—', d.targetKcal ?? '—', d.protein ?? '—', d.targetProtein ?? '—'])} />
      </Card>
      {split && (
        <Card>
          <div className="text-sm font-semibold mb-3">Répartition moyenne des calories</div>
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
            <div style={{ width: `${split[0] * 100}%`, background: 'var(--color-protein)' }} />
            <div style={{ width: `${split[1] * 100}%`, background: 'var(--color-carbs)' }} />
            <div style={{ width: `${split[2] * 100}%`, background: 'var(--color-fat)' }} />
          </div>
          <div className="grid grid-cols-3 text-center mt-3 text-sm">
            <div>
              <span className="text-muted">Protéines</span> <strong className="tnum">{fmtSmart(split[0] * 100, 0)} %</strong>
            </div>
            <div>
              <span className="text-muted">Glucides</span> <strong className="tnum">{fmtSmart(split[1] * 100, 0)} %</strong>
            </div>
            <div>
              <span className="text-muted">Lipides</span> <strong className="tnum">{fmtSmart(split[2] * 100, 0)} %</strong>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
