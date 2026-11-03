import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileDown, Trophy } from 'lucide-react';
import { Button, Card, Delta, IconButton, PageHeader, SectionTitle, Stat, SubNav } from '../../components/ui';
import { PROGRESS_NAV } from './nav';
import { ScoreCard } from './ScoreCard';
import { InsightCard } from '../Coach';
import { useCtx, useToday } from '../../lib/useCtx';
import { weeklyReport, type WeeklyReport as WR } from '../../lib/analytics/reports';
import { addDays, formatDate, formatDuration, startOfWeek } from '../../lib/dates';
import { fmt, fmtSmart, fmtVolume } from '../../lib/format';
import { RECORD_LABELS } from '../../lib/calc/training';
import { toast } from '../../components/toast';
import type { Insight } from '../../lib/analytics/coach';

export default function WeeklyReportPage() {
  const ctx = useCtx();
  const t = useToday();
  const current = startOfWeek(t);
  const [week, setWeek] = useState(addDays(current, -7));
  const r = useMemo(() => weeklyReport(ctx, week, t), [ctx, week, t]);
  const archived = ctx.data.weeklyReports.find((w) => w.weekStart === week);
  const archivedRecs = (archived?.data as WR | undefined)?.recommendations as Insight[] | undefined;
  const recs = week < current && archivedRecs?.length ? archivedRecs : r.recommendations;

  return (
    <div>
      <PageHeader title="Bilan hebdo" subtitle="Généré automatiquement à partir de tes données" action={<Button size="sm" icon={<FileDown size={14} />} onClick={() => void import('../../lib/pdf').then((m) => m.exportWeeklyPdf(r, ctx)).catch((e) => toast('Export impossible', (e as Error).message, 'error'))}>PDF</Button>} />
      <SubNav items={PROGRESS_NAV} active="/progress/weekly" />
      <div className="flex items-center justify-between mb-4">
        <IconButton label="Semaine précédente" onClick={() => setWeek(addDays(week, -7))}>
          <ChevronLeft size={20} />
        </IconButton>
        <div className="text-center">
          <div className="text-sm font-semibold">
            {formatDate(week)} – {formatDate(addDays(week, 6))}
          </div>
          <div className="text-xs text-muted">{week === current ? 'Semaine en cours' : week === addDays(current, -7) ? 'Semaine dernière' : ''}</div>
        </div>
        <IconButton label="Semaine suivante" onClick={() => setWeek(addDays(week, 7))} disabled={week >= current}>
          <ChevronRight size={20} />
        </IconButton>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <Stat label="Entraînements" value={`${r.sessions}${r.plannedSessions ? ` / ${r.plannedSessions}` : ''}`} sub={formatDuration(r.durationMs)} />
        </Card>
        <Card>
          <Stat label="Volume" value={fmtVolume(r.volume)} sub={<>vs sem. préc. : <Delta value={r.prevVolume ? ((r.volume - r.prevVolume) / r.prevVolume) * 100 : null} unit="%" digits={0} /></>} />
        </Card>
        <Card>
          <Stat label="Calories moyennes" value={r.nutrition.avgKcal !== null ? fmt(r.nutrition.avgKcal) : '—'} sub={r.targetKcal ? `objectif ${fmt(r.targetKcal)} · ${r.nutrition.loggedDays} j saisis` : undefined} />
        </Card>
        <Card>
          <Stat label="Protéines moyennes" value={r.nutrition.avgProtein !== null ? `${fmt(r.nutrition.avgProtein)} g` : '—'} sub={r.targetProtein ? `objectif ${fmt(r.targetProtein)} g` : undefined} />
        </Card>
        <Card>
          <Stat label="Poids moyen" value={r.weightAvg !== null ? `${fmtSmart(r.weightAvg, 2)} kg` : '—'} sub={<>vs sem. préc. : <Delta value={r.weightAvg !== null && r.prevWeightAvg !== null ? r.weightAvg - r.prevWeightAvg : null} unit="kg" digits={2} invert={ctx.data.profile?.goal === 'cut'} /></>} />
        </Card>
        <Card>
          <Stat label="Records battus" value={r.records.length} />
        </Card>
        <Card>
          <Stat label="Calories dans l'objectif" value={`${r.nutrition.kcalOnTargetDays} j`} sub="à ± 10 %" />
        </Card>
        <Card>
          <Stat label="Protéines atteintes" value={`${r.nutrition.proteinOnTargetDays} j`} sub="≥ 90 % de l'objectif" />
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <section>
          <SectionTitle>Évolution des charges</SectionTitle>
          <Card className="!p-0">
            {r.loadChanges.length ? (
              <ul className="divide-y divide-line">
                {r.loadChanges.slice(0, 10).map((c) => (
                  <li key={c.exerciseId} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{c.name}</span>
                    <span className="tnum text-muted shrink-0">
                      {fmtSmart(c.before, 1)} → {fmtSmart(c.after, 1)} kg <Delta value={c.deltaPct} unit="%" className="ml-1" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted p-4">Pas de comparaison possible cette semaine.</p>
            )}
            <p className="text-[11px] text-faint px-4 pb-3">Meilleur 1RM estimé de la semaine comparé à celui de la semaine précédente.</p>
          </Card>
          {r.records.length > 0 && (
            <Card className="mt-3">
              <div className="flex items-center gap-2 font-semibold text-sm mb-2">
                <Trophy size={16} className="text-accent" /> Records de la semaine
              </div>
              <ul className="text-sm space-y-1">
                {r.records.slice(0, 8).map((e, i) => (
                  <li key={i} className="text-muted">
                    <span className="text-ink">{ctx.exById.get(e.exerciseId)?.name}</span> · {RECORD_LABELS[e.type]} · {fmtSmart(e.weightKg, 2)} kg × {e.reps}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
        <section>
          <SectionTitle>Trois recommandations prioritaires</SectionTitle>
          <div className="space-y-3">
            {recs.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
            {!recs.length && <p className="text-sm text-muted">Pas assez de données pour formuler des recommandations.</p>}
          </div>
          <div className="mt-5">
            <ScoreCard {...r.consistency} />
          </div>
        </section>
      </div>
    </div>
  );
}
