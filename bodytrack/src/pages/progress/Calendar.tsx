import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Card, IconButton, PageHeader, Sheet, SubNav, cx } from '../../components/ui';
import { PROGRESS_NAV } from './nav';
import { useCtx, useToday } from '../../lib/useCtx';
import { addDays, addMonths, dateOf, endOfMonth, formatLongDate, formatMonth, startOfMonth, startOfWeek } from '../../lib/dates';
import { fmt, fmtSmart, fmtVolume } from '../../lib/format';
import { sessionSummary } from '../../lib/analytics/stats';
import { navigate } from '../../lib/router';

export default function CalendarPage() {
  const ctx = useCtx();
  const t = useToday();
  const [month, setMonth] = useState(startOfMonth(t));
  const [day, setDay] = useState<string | null>(null);
  const sessionsByDate = useMemo(() => {
    const m = new Map<string, typeof ctx.doneSessions>();
    for (const s of ctx.doneSessions) {
      const d = dateOf(s.startedAt);
      m.set(d, [...(m.get(d) ?? []), s]);
    }
    return m;
  }, [ctx]);
  const weights = useMemo(() => new Map(ctx.data.weights.map((w) => [w.date, w.weightKg])), [ctx]);
  const start = startOfWeek(month);
  const end = endOfMonth(month);
  const cells: string[] = [];
  for (let d = start; d <= end || cells.length % 7; d = addDays(d, 1)) cells.push(d);
  const inMonth = cells.filter((d) => d.startsWith(month.slice(0, 7)) && d <= t);
  const nTrain = inMonth.filter((d) => sessionsByDate.has(d)).length;
  const nFood = inMonth.filter((d) => ctx.loggedDates.has(d)).length;
  const nWeigh = inMonth.filter((d) => weights.has(d)).length;

  return (
    <div>
      <PageHeader title="Calendrier" subtitle="Ton activité jour par jour" />
      <SubNav items={PROGRESS_NAV} active="/progress/calendar" />
      <Card>
        <div className="flex items-center justify-between mb-4">
          <IconButton label="Mois précédent" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft size={20} />
          </IconButton>
          <div className="display text-xl font-bold uppercase">{formatMonth(month)}</div>
          <IconButton label="Mois suivant" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= startOfMonth(t)}>
            <ChevronRight size={20} />
          </IconButton>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-faint mb-1">
          {['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d) => {
            const inM = d.startsWith(month.slice(0, 7));
            const train = sessionsByDate.has(d);
            const food = ctx.loggedDates.has(d);
            const w = weights.has(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDay(d)}
                disabled={!inM || d > t}
                className={cx('aspect-square rounded-xl flex flex-col items-center justify-center gap-1 text-sm transition', !inM && 'opacity-20', d > t && 'opacity-30', train ? 'bg-accent/15 text-ink' : 'bg-surface-2/60 text-muted', d === t && 'ring-1 ring-accent')}
                aria-label={`${formatLongDate(d)}${train ? ', séance' : ''}${food ? ', repas saisis' : ''}${w ? ', pesée' : ''}`}
              >
                <span className={cx('tnum', train && 'font-bold text-accent')}>{Number(d.slice(8))}</span>
                <span className="flex gap-0.5 h-1.5">
                  {train && <span className="size-1.5 rounded-full bg-accent" />}
                  {food && <span className="size-1.5 rounded-full bg-info" />}
                  {w && <span className="size-1.5 rounded-full bg-warn" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted mt-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-accent" /> Séance ({nTrain} j)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-info" /> Repas saisis ({nFood} j)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-warn" /> Pesée ({nWeigh} j)
          </span>
        </div>
      </Card>

      <Sheet open={!!day} onClose={() => setDay(null)} title={day ? formatLongDate(day) : ''}>
        {day && (
          <div className="space-y-3">
            {(sessionsByDate.get(day) ?? []).map((s) => {
              const sum = sessionSummary(ctx, s);
              return (
                <Card key={s.id} onClick={() => navigate(`/training/session/${s.id}`)} className="!p-3">
                  <div className="text-sm font-semibold">{s.name}</div>
                  <div className="text-xs text-muted">
                    {sum.sets} séries · {fmtVolume(sum.volume)}
                  </div>
                </Card>
              );
            })}
            {!sessionsByDate.has(day) && <p className="text-sm text-muted">Pas de séance ce jour-là (le repos fait aussi partie de la progression).</p>}
            <div className="text-sm">
              {ctx.loggedDates.has(day) ? (
                <>
                  Nutrition : <strong className="tnum">{fmt(ctx.dayTotals(day).kcal)} kcal</strong>, {fmt(ctx.dayTotals(day).protein)} g de protéines
                </>
              ) : (
                <span className="text-muted">Aucun repas saisi.</span>
              )}
            </div>
            {weights.has(day) && (
              <div className="text-sm">
                Poids : <strong className="tnum">{fmtSmart(weights.get(day)!, 1)} kg</strong>
              </div>
            )}
            <Button size="sm" variant="outline" onClick={() => navigate(`/nutrition?date=${day}`)}>
              Ouvrir le journal de ce jour
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
