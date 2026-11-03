import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileDown, Trophy } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button, Card, Delta, IconButton, PageHeader, SectionTitle, Stat, SubNav } from '../../components/ui';
import { ACCENT, ChartTooltip, axisProps, gridProps } from '../../components/charts';
import { PhotoImage } from '../../components/PhotoImage';
import { PROGRESS_NAV } from './nav';
import { POSES } from './Photos';
import { ScoreCard } from './ScoreCard';
import { useCtx, useToday } from '../../lib/useCtx';
import { MEASUREMENT_FIELDS, monthlyReport } from '../../lib/analytics/reports';
import { addMonths, formatDate, formatDuration, formatMonth, startOfMonth } from '../../lib/dates';
import { fmt, fmtSmart, fmtVolume } from '../../lib/format';
import { RECORD_LABELS } from '../../lib/calc/training';
import { toast } from '../../components/toast';

export default function MonthlyReportPage() {
  const ctx = useCtx();
  const t = useToday();
  const [month, setMonth] = useState(startOfMonth(t));
  const r = useMemo(() => monthlyReport(ctx, month, t), [ctx, month, t]);
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <PageHeader
        title="Bilan mensuel"
        subtitle="Physique, musculation et nutrition"
        action={
          <Button
            size="sm"
            icon={<FileDown size={14} />}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await (await import('../../lib/pdf')).exportMonthlyPdf(r, ctx);
              } catch (e) {
                toast('Export impossible', (e as Error).message, 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            PDF
          </Button>
        }
      />
      <SubNav items={PROGRESS_NAV} active="/progress/monthly" />
      <div className="flex items-center justify-between mb-5">
        <IconButton label="Mois précédent" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft size={20} />
        </IconButton>
        <div className="display text-2xl font-bold uppercase">{formatMonth(month)}</div>
        <IconButton label="Mois suivant" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= startOfMonth(t)}>
          <ChevronRight size={20} />
        </IconButton>
      </div>

      <div className="space-y-8">
        <section>
          <SectionTitle>Physique</SectionTitle>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Card>
              <Stat label="Début de mois" value={r.weightStart !== null ? `${fmtSmart(r.weightStart, 1)} kg` : '—'} sub="moy. 7 premiers jours" />
            </Card>
            <Card>
              <Stat label="Fin de mois" value={r.weightEnd !== null ? `${fmtSmart(r.weightEnd, 1)} kg` : '—'} sub="moy. 7 derniers jours" />
            </Card>
            <Card>
              <Stat label="Évolution" value={<Delta value={r.weightChange} unit="kg" invert={ctx.data.profile?.goal === 'cut'} className="!text-2xl" />} />
            </Card>
          </div>
          {r.weightSeries.length >= 2 && (
            <Card className="mb-3">
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={r.weightSeries.map((w) => ({ label: formatDate(w.date), w: w.weightKg }))} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="label" {...axisProps} minTickGap={24} />
                    <YAxis {...axisProps} domain={['dataMin - 0.5', 'dataMax + 0.5']} width={44} tickFormatter={(v: number) => fmtSmart(v, 1)} />
                    <Tooltip content={<ChartTooltip valueFormatter={(v) => `${fmtSmart(v, 1)} kg`} />} cursor={{ stroke: '#5b626b' }} />
                    <Line dataKey="w" name="Pesée" stroke={ACCENT} strokeWidth={2} dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
          {r.measurementsEnd && (
            <Card className="!p-0 mb-3 overflow-x-auto">
              <table className="w-full text-sm tnum">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Mensuration</th>
                    <th className="text-right font-medium px-2">{r.measurementsStart ? formatDate(r.measurementsStart.date) : '—'}</th>
                    <th className="text-right font-medium px-2">{formatDate(r.measurementsEnd.date)}</th>
                    <th className="text-right font-medium px-4">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {MEASUREMENT_FIELDS.map((f) => {
                    const a = r.measurementsStart?.[f.key] ?? null;
                    const b = r.measurementsEnd?.[f.key] ?? null;
                    return (
                      <tr key={f.key} className="border-t border-line">
                        <td className="px-4 py-2">{f.label}</td>
                        <td className="text-right px-2">{a !== null ? fmtSmart(a, 1) : '—'}</td>
                        <td className="text-right px-2">{b !== null ? fmtSmart(b, 1) : '—'}</td>
                        <td className="text-right px-4">{a !== null && b !== null && r.measurementsStart?.id !== r.measurementsEnd?.id ? <Delta value={b - a} unit="cm" invert={f.key === 'waistCm'} /> : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
          {r.photos.length > 0 && (
            <Card>
              <div className="text-sm font-semibold mb-3">Comparaison photo</div>
              <div className="space-y-4">
                {r.photos.map((p) => (
                  <div key={p.pose}>
                    <div className="text-xs text-muted mb-1.5">{POSES.find((x) => x.value === p.pose)?.label}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <PhotoImage photo={p.first} className="rounded-xl aspect-[3/4]" />
                        <div className="text-[11px] text-muted mt-1 text-center">{formatDate(p.first.date)}</div>
                      </div>
                      <div>
                        <PhotoImage photo={p.last} className="rounded-xl aspect-[3/4]" />
                        <div className="text-[11px] text-muted mt-1 text-center">{formatDate(p.last.date)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </section>

        <section>
          <SectionTitle>Musculation</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <Card>
              <Stat label="Séances" value={r.sessions} sub={formatDuration(r.durationMs)} />
            </Card>
            <Card>
              <Stat label="Séries" value={fmt(r.sets)} />
            </Card>
            <Card>
              <Stat label="Volume total" value={fmtVolume(r.volume)} />
            </Card>
            <Card>
              <Stat label="Records" value={r.records.length} />
            </Card>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Card>
              <div className="text-sm font-semibold mb-2">Exercices ayant le plus progressé</div>
              {r.mostProgressed.length ? (
                <ul className="text-sm space-y-1.5">
                  {r.mostProgressed.map((c) => (
                    <li key={c.exerciseId} className="flex justify-between gap-2">
                      <span className="truncate">{c.name}</span>
                      <span className="tnum shrink-0">
                        <span className="text-muted">
                          {fmtSmart(c.before, 1)} → {fmtSmart(c.after, 1)} kg
                        </span>{' '}
                        <Delta value={c.deltaPct} unit="%" />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Pas de progression mesurable ce mois-ci.</p>
              )}
              <p className="text-[11px] text-faint mt-2">1RM estimé (Epley) : meilleur du mois vs meilleur du mois précédent.</p>
            </Card>
            <Card>
              <div className="text-sm font-semibold mb-2">Exercices en stagnation</div>
              {r.stagnating.length ? (
                <ul className="text-sm space-y-1 text-muted">
                  {r.stagnating.map((s) => (
                    <li key={s.exerciseId}>{s.name}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Aucun exercice en stagnation.</p>
              )}
              {r.records.length > 0 && (
                <>
                  <div className="text-sm font-semibold mt-4 mb-2 flex items-center gap-2">
                    <Trophy size={14} className="text-accent" /> Records du mois
                  </div>
                  <ul className="text-xs text-muted space-y-1">
                    {r.records.slice(0, 6).map((e, i) => (
                      <li key={i}>
                        <span className="text-ink">{ctx.exById.get(e.exerciseId)?.name}</span> · {RECORD_LABELS[e.type]} · {formatDate(e.date)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </div>
        </section>

        <section>
          <SectionTitle>Nutrition</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <Stat label="Calories moyennes" value={r.nutrition.avgKcal !== null ? fmt(r.nutrition.avgKcal) : '—'} sub={r.targetKcal ? `objectif ${fmt(r.targetKcal)}` : undefined} />
            </Card>
            <Card>
              <Stat label="Protéines moyennes" value={r.nutrition.avgProtein !== null ? `${fmt(r.nutrition.avgProtein)} g` : '—'} sub={r.targetProtein ? `objectif ${fmt(r.targetProtein)} g` : undefined} />
            </Card>
            <Card>
              <Stat label="Régularité alimentaire" value={`${r.nutrition.loggedDays} / ${r.nutrition.days} j`} />
            </Card>
            <Card>
              <Stat label="Respect des objectifs" value={`${r.nutrition.kcalOnTargetDays} j`} sub={`kcal ± 10 % · protéines : ${r.nutrition.proteinOnTargetDays} j`} />
            </Card>
          </div>
        </section>

        <ScoreCard {...r.consistency} />
      </div>
    </div>
  );
}
