import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button, Card, Notice, PageHeader, SectionTitle, cx } from '../components/ui';
import { ACCENT, ChartTooltip, DataTable, axisProps, gridProps } from '../components/charts';
import { useCtx, useToday } from '../lib/useCtx';
import { allInsights, weeklySeries, type Insight, type InsightCategory } from '../lib/analytics/coach';
import { adjustCalories, recomputeNutritionGoal } from '../lib/actions';
import { confirmDialog } from '../components/confirm';
import { toast } from '../components/toast';
import { navigate } from '../lib/router';
import { formatDate } from '../lib/dates';
import { fmt, fmtSmart } from '../lib/format';

const CATS: { key: InsightCategory; label: string }[] = [
  { key: 'nutrition', label: 'Coach nutritionnel' },
  { key: 'training', label: 'Coach sportif' },
  { key: 'regularity', label: 'Régularité' },
  { key: 'cross', label: 'Analyse croisée' },
];

export function InsightCard({ insight: i }: { insight: Insight }) {
  const Icon = i.level === 'positive' ? CheckCircle2 : i.level === 'warning' ? AlertTriangle : Info;
  const run = async () => {
    const a = i.action;
    if (!a) return;
    if (a.kind === 'link') return navigate(a.to);
    if (a.kind === 'adjustCalories') {
      const ok = await confirmDialog({ title: 'Modifier ton objectif calorique ?', text: `${a.label}. Tes macronutriments seront recalculés. Tu pourras revenir en arrière à tout moment dans Nutrition → Objectifs.`, confirmLabel: 'Appliquer' });
      if (ok) {
        adjustCalories(a.deltaKcal);
        toast('Objectif mis à jour', a.label);
      }
    }
    if (a.kind === 'setMaintenance') {
      const ok = await confirmDialog({ title: 'Utiliser ta dépense observée ?', text: `Ton maintien passera à ${fmt(a.maintenanceKcal)} kcal et ton objectif sera recalculé avec le même surplus ou déficit.`, confirmLabel: 'Appliquer' });
      if (ok) {
        recomputeNutritionGoal({ maintenanceOverride: a.maintenanceKcal });
        toast('Maintien mis à jour', `${fmt(a.maintenanceKcal)} kcal`);
      }
    }
  };
  return (
    <div className={cx('card p-4 flex gap-3', i.level === 'warning' && '!border-warn/30', i.level === 'positive' && '!border-accent/25')}>
      <Icon size={18} className={cx('shrink-0 mt-0.5', i.level === 'positive' ? 'text-accent' : i.level === 'warning' ? 'text-warn' : 'text-info')} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm">{i.title}</div>
        <p className="text-sm text-muted mt-1 leading-relaxed">{i.text}</p>
        {i.evidence && <p className="text-xs text-faint mt-1.5">{i.evidence}</p>}
        {i.action && (
          <Button size="sm" variant={i.action.kind === 'link' ? 'secondary' : 'outline'} className="mt-3" onClick={() => void run()}>
            {i.action.label}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Coach() {
  const ctx = useCtx();
  const t = useToday();
  const insights = useMemo(() => allInsights(ctx, t), [ctx, t]);
  const series = useMemo(() => weeklySeries(ctx, t, 12), [ctx, t]);
  const chart = series.map((s) => ({ ...s, label: formatDate(s.weekStart) }));

  return (
    <div>
      <PageHeader title="Coach" subtitle="Analyses calculées à partir de tes données réelles. Aucune modification n'est appliquée sans ta validation." backTo="/" />
      <div className="space-y-8">
        {CATS.map((c) => {
          const list = insights.filter((i) => i.category === c.key);
          if (!list.length) return null;
          return (
            <section key={c.key}>
              <SectionTitle>{c.label}</SectionTitle>
              <div className="grid md:grid-cols-2 gap-3">
                {list.map((i) => (
                  <InsightCard key={i.id} insight={i} />
                ))}
              </div>
            </section>
          );
        })}
        {!insights.length && <Notice>Pas encore assez de données. Enregistre quelques séances, repas et pesées.</Notice>}

        <section>
          <SectionTitle>Tendances hebdomadaires croisées</SectionTitle>
          <p className="text-xs text-muted mb-3">Chaque indicateur a son propre graphique (12 dernières semaines). Les évolutions simultanées ne prouvent pas un lien de cause à effet.</p>
          <div className="grid md:grid-cols-2 gap-3">
            <Mini title="Poids moyen (kg)" data={chart} k="weight" unit="kg" />
            <Mini title="Indice de force (base 100)" data={chart} k="strengthIndex" unit="" hint="Meilleur 1RM estimé de la semaine rapporté à la première semaine, moyenne des exercices" />
            <Mini title="Calories moyennes (jours saisis)" data={chart} k="kcal" unit="kcal" bar />
            <Mini title="Protéines moyennes (g)" data={chart} k="protein" unit="g" bar />
            <Mini title="Séances par semaine" data={chart} k="sessions" unit="" bar />
            <Mini title="Volume hebdomadaire (kg)" data={chart} k="volume" unit="kg" bar />
          </div>
          <DataTable
            columns={['Semaine', 'Poids', 'Indice force', 'kcal', 'Protéines', 'Séances', 'Volume']}
            rows={series.map((s) => [formatDate(s.weekStart), s.weight !== null ? fmtSmart(s.weight, 1) : '—', s.strengthIndex !== null ? fmtSmart(s.strengthIndex, 1) : '—', s.kcal !== null ? fmt(s.kcal) : '—', s.protein !== null ? fmt(s.protein) : '—', s.sessions, fmt(s.volume)])}
          />
        </section>
        <Notice>Le coach ne pose aucun diagnostic médical (blessure, surentraînement…). En cas de douleur ou de doute, consulte un professionnel de santé.</Notice>
      </div>
    </div>
  );
}

function Mini({ title, data, k, unit, bar, hint }: { title: string; data: Record<string, unknown>[]; k: string; unit: string; bar?: boolean; hint?: string }) {
  const has = data.some((d) => d[k] !== null && d[k] !== undefined && d[k] !== 0);
  return (
    <Card className="!p-3">
      <div className="text-xs text-muted mb-1" title={hint}>
        {title}
      </div>
      {has ? (
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            {bar ? (
              <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
                <YAxis {...axisProps} width={44} />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => `${fmtSmart(v, 1)}${unit ? ` ${unit}` : ''}`} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey={k} name={title} fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
                <YAxis {...axisProps} width={44} domain={['auto', 'auto']} />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => `${fmtSmart(v, 1)}${unit ? ` ${unit}` : ''}`} />} cursor={{ stroke: '#5b626b' }} />
                <Line dataKey={k} name={title} stroke={ACCENT} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: ACCENT }} connectNulls />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-32 grid place-items-center text-xs text-faint">Pas encore de données</div>
      )}
    </Card>
  );
}
