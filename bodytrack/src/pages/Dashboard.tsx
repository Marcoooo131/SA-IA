import { useMemo, useState } from 'react';
import { Apple, ArrowRight, Brain, CalendarClock, ChevronRight, Dumbbell, Play, Scale, Sparkles, Trophy } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { Badge, Button, Card, MacroBar, Ring, SectionTitle, Stat, cx } from '../components/ui';
import { ChartTooltip, ACCENT } from '../components/charts';
import { WeightSheet } from '../components/WeightSheet';
import { useCtx, useToday } from '../lib/useCtx';
import { addDays, ageFromBirthDate, dateOf, formatDate, formatDuration, formatLongDate, startOfWeek } from '../lib/dates';
import { activityStats, nextSession, recentRecords, sessionSummary } from '../lib/analytics/stats';
import { dailySummary } from '../lib/analytics/dashboard';
import { allInsights } from '../lib/analytics/coach';
import { averageChange, latestLog, movingAverage, weightSeries } from '../lib/calc/weight';
import { fmt, fmtKg, fmtSmart, fmtVolume } from '../lib/format';
import { startSession } from '../lib/actions';
import { navigate } from '../lib/router';
import { RECORD_LABELS } from '../lib/calc/training';
import { InsightCard } from './Coach';

const GOAL_LABEL = { bulk: 'Prise de masse', maintain: 'Maintien', cut: 'Sèche' } as const;

export default function Dashboard() {
  const ctx = useCtx();
  const t = useToday();
  const p = ctx.data.profile!;
  const [weightOpen, setWeightOpen] = useState(false);
  const week = activityStats(ctx, startOfWeek(t), t);
  const next = nextSession(ctx, t);
  const last = ctx.doneSessions[ctx.doneSessions.length - 1];
  const records = recentRecords(ctx, addDays(t, -30)).slice(0, 4);
  const summary = dailySummary(ctx, t);
  const insights = useMemo(() => allInsights(ctx, t).filter((i) => i.level !== 'positive').slice(0, 2), [ctx, t]);
  const goal = ctx.goalOn(t);
  const totals = ctx.dayTotals(t);
  const latest = latestLog(ctx.data.weights);
  const avg7 = movingAverage(ctx.data.weights, t, 7);
  const change30 = averageChange(ctx.data.weights, t, 30);
  const spark = weightSeries(ctx.data.weights, addDays(t, -60), t).filter((x) => x.avg7 !== null);
  const hour = new Date().getHours();
  const hello = hour < 5 ? 'Bonne nuit' : hour < 18 ? 'Bonjour' : 'Bonsoir';

  const startNext = () => {
    if (ctx.activeSession) return navigate(`/training/session/${ctx.activeSession.id}`);
    if (next) return navigate(`/training/session/${startSession({ programId: next.programId, dayId: next.dayId })}`);
    navigate('/training');
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted first-letter:uppercase">{formatLongDate(t)}</p>
        <h1 className="display text-4xl font-bold uppercase mt-1">
          {hello}, <span className="text-accent">{p.displayName}</span>
        </h1>
      </div>

      {/* Actions rapides */}
      <div className="grid grid-cols-3 gap-2">
        <QuickAction icon={<Play size={18} />} label={ctx.activeSession ? 'Reprendre' : 'Séance'} onClick={startNext} primary />
        <QuickAction icon={<Apple size={18} />} label="Repas" onClick={() => navigate('/nutrition')} />
        <QuickAction icon={<Scale size={18} />} label="Poids" onClick={() => setWeightOpen(true)} />
      </div>

      {/* Bilan du jour */}
      <Card className="relative overflow-hidden">
        <div className="absolute -right-16 -top-16 size-48 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
        <SectionTitle action={<Sparkles size={18} className="text-accent" />}>Ton bilan du jour</SectionTitle>
        {summary.length ? (
          <ul className="space-y-2.5">
            {summary.map((l) => (
              <li key={l.id} className="flex gap-2.5 text-sm">
                <span className={cx('mt-1.5 size-1.5 rounded-full shrink-0', l.tone === 'positive' ? 'bg-accent' : l.tone === 'warning' ? 'bg-warn' : 'bg-faint')} />
                <span>{l.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Commence par saisir ton poids, un repas ou une séance : ton bilan se construira à partir de tes données.</p>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Nutrition */}
        <Card onClick={() => navigate('/nutrition')}>
          <SectionTitle action={<ChevronRight size={18} className="text-faint" />}>Nutrition</SectionTitle>
          {goal ? (
            <div className="flex items-center gap-5">
              <Ring value={totals.kcal} max={goal.calories} size={128} stroke={11} label={`${Math.round(totals.kcal)} kcal sur ${goal.calories}`}>
                <div>
                  <div className="display text-3xl font-bold tnum leading-none">{fmt(totals.kcal)}</div>
                  <div className="text-[11px] text-muted">/ {fmt(goal.calories)} kcal</div>
                  <div className={cx('text-[11px] mt-1 font-medium tnum', goal.calories - totals.kcal >= 0 ? 'text-accent' : 'text-warn')}>
                    {goal.calories - totals.kcal >= 0 ? `Reste ${fmt(goal.calories - totals.kcal)}` : `+${fmt(totals.kcal - goal.calories)}`}
                  </div>
                </div>
              </Ring>
              <div className="flex-1 space-y-3 min-w-0">
                <MacroBar label="Protéines" value={totals.protein} target={goal.proteinG} color="var(--color-protein)" />
                <MacroBar label="Glucides" value={totals.carbs} target={goal.carbsG} color="var(--color-carbs)" />
                <MacroBar label="Lipides" value={totals.fat} target={goal.fatG} color="var(--color-fat)" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Définis tes objectifs nutritionnels pour suivre tes apports.</p>
          )}
        </Card>

        {/* Profil physique */}
        <Card onClick={() => navigate('/progress')}>
          <SectionTitle action={<ChevronRight size={18} className="text-faint" />}>Profil physique</SectionTitle>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Poids actuel" value={fmtKg(latest?.weightKg)} sub={latest ? formatDate(latest.date) : 'Aucune pesée'} />
            <Stat label="Moyenne 7 j" value={fmtKg(avg7)} sub={change30 !== null ? `${change30 >= 0 ? '+' : '−'}${fmtSmart(Math.abs(change30), 1)} kg sur 30 j` : '30 j : —'} />
            <Stat label="Objectif" value={fmtKg(p.targetWeightKg)} sub={GOAL_LABEL[p.goal]} />
          </div>
          {spark.length > 3 && (
            <div className="h-16 mt-3 -mx-1" aria-label="Moyenne mobile du poids sur 60 jours">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spark} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={['dataMin - 0.3', 'dataMax + 0.3']} />
                  <Tooltip content={<ChartTooltip labelFormatter={(_, pl) => formatDate(String(pl?.date ?? ''))} valueFormatter={(v) => `${fmtSmart(v, 1)} kg`} />} cursor={{ stroke: '#5b626b' }} />
                  <Area type="monotone" dataKey="avg7" name="Moyenne 7 j" stroke={ACCENT} strokeWidth={2} fill="url(#spark)" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted mt-3">
            <span>{fmt(p.heightCm)} cm</span>
            <span>{ageFromBirthDate(p.birthDate)} ans</span>
            {p.physiqueGoal && <span className="truncate">« {p.physiqueGoal} »</span>}
          </div>
        </Card>
      </div>

      {/* Activité */}
      <section>
        <SectionTitle action={<a href="#/training/history" className="text-xs text-accent">Historique</a>}>Activité sportive</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <Stat label="Séances (semaine)" value={`${week.sessions}${p.trainingDaysPerWeek ? ` / ${p.trainingDaysPerWeek}` : ''}`} />
          </Card>
          <Card>
            <Stat label="Temps à la salle" value={formatDuration(week.durationMs)} />
          </Card>
          <Card>
            <Stat label="Séries" value={fmt(week.sets)} />
          </Card>
          <Card>
            <Stat label="Volume soulevé" value={fmtVolume(week.volume)} />
          </Card>
        </div>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <Card onClick={last ? () => navigate(`/training/session/${last.id}`) : undefined}>
            <div className="flex items-center gap-3">
              <span className="size-10 rounded-xl bg-surface-2 grid place-items-center text-muted">
                <Dumbbell size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted">Dernière séance</div>
                {last ? (
                  <>
                    <div className="font-semibold truncate">{last.name}</div>
                    <div className="text-xs text-muted">
                      {formatDate(dateOf(last.startedAt), { weekday: 'short', day: 'numeric', month: 'short' })} · {sessionSummary(ctx, last).sets} séries · {fmtVolume(sessionSummary(ctx, last).volume)}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted">Aucune séance pour l'instant</div>
                )}
              </div>
            </div>
          </Card>
          <Card onClick={startNext}>
            <div className="flex items-center gap-3">
              <span className="size-10 rounded-xl bg-accent/15 grid place-items-center text-accent">
                <CalendarClock size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted">Prochaine séance prévue</div>
                {next ? (
                  <>
                    <div className="font-semibold truncate">{next.dayName}</div>
                    <div className="text-xs text-muted">
                      {next.label}
                      {next.date ? ` · ${formatDate(next.date, { weekday: 'long' })}` : ''} · {next.programName}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted">Active un programme pour planifier tes séances</div>
                )}
              </div>
              <ArrowRight size={18} className="text-accent" />
            </div>
          </Card>
        </div>
      </section>

      {/* Records récents */}
      <section>
        <SectionTitle action={<a href="#/training/records" className="text-xs text-accent">Tous les records</a>}>Records récents</SectionTitle>
        {records.length ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {records.map((r) => (
              <Card key={`${r.exerciseId}${r.sessionId}${r.type}`} onClick={() => navigate(`/exercises/${r.exerciseId}`)}>
                <div className="flex gap-3 items-center">
                  <Trophy size={18} className="text-accent shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{ctx.exById.get(r.exerciseId)?.name}</div>
                    <div className="text-xs text-muted">
                      {RECORD_LABELS[r.type]} · {fmtSmart(r.weightKg, 2)} kg × {r.reps}
                      {r.type === 'e1rm' && ` → ${fmtSmart(r.value, 1)} kg estimés`}
                    </div>
                  </div>
                  <Badge>{formatDate(r.date)}</Badge>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <p className="text-sm text-muted">Aucun record sur les 30 derniers jours. Les records apparaissent dès ta deuxième séance sur un exercice.</p>
          </Card>
        )}
      </section>

      {/* Coach */}
      <section>
        <SectionTitle action={<a href="#/coach" className="text-xs text-accent">Coach complet</a>}>
          <span className="flex items-center gap-2">
            <Brain size={18} className="text-accent" /> Coach
          </span>
        </SectionTitle>
        {insights.length ? (
          <div className="grid md:grid-cols-2 gap-3">
            {insights.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        ) : (
          <Card>
            <p className="text-sm text-muted">Rien à signaler : continue sur ta lancée. Consulte le coach pour l'analyse détaillée.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/coach')}>
              Voir l'analyse
            </Button>
          </Card>
        )}
      </section>

      {weightOpen && <WeightSheet open onClose={() => setWeightOpen(false)} />}
    </div>
  );
}

function QuickAction({ icon, label, onClick, primary }: { icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('h-16 rounded-2xl flex flex-col items-center justify-center gap-1 text-xs font-semibold transition active:scale-95', primary ? 'bg-accent text-accent-ink shadow-[0_0_30px_-10px_var(--color-accent)]' : 'bg-surface border border-line text-ink hover:border-faint')}
    >
      {icon}
      {label}
    </button>
  );
}
