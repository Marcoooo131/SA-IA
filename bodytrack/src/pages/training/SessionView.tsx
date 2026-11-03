import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronRight, Copy, Flag, History, MoreHorizontal, Plus, StickyNote, Timer, Trash2, TrendingUp, Trophy } from 'lucide-react';
import type { WorkoutExercise, WorkoutSet } from '../../lib/types';
import { Badge, Button, Card, EmptyState, IconButton, NumberInput, PageHeader, Sheet, cx } from '../../components/ui';
import { ExercisePicker, MuscleDot } from '../../components/ExercisePicker';
import { useCtx } from '../../lib/useCtx';
import { store } from '../../lib/store/store';
import { addExerciseToSession, addSet, applyWeightToPendingSets, copyLastPerformance, deleteSession, finishSession, moveSessionExercise, removeExerciseFromSession, validateSet } from '../../lib/actions';
import { comparePerformances, epley1RM, exerciseHistory, performanceFromSets, progressionSuggestion, RECORD_LABELS, workingSets, totalVolume, type ExercisePerformance } from '../../lib/calc/training';
import { useRest, unlockAudio } from '../../lib/restTimer';
import { dateOf, formatClock, formatDate, formatDuration } from '../../lib/dates';
import { fmtSmart, fmtVolume } from '../../lib/format';
import { navigate } from '../../lib/router';
import { confirmDialog } from '../../components/confirm';
import { toast } from '../../components/toast';
import { REST_OPTIONS } from './restOptions';
import type { Ctx } from '../../lib/analytics/context';

export default function SessionView({ params }: { params: Record<string, string> }) {
  const ctx = useCtx();
  const session = ctx.data.sessions.find((s) => s.id === params.id);
  const [picker, setPicker] = useState(false);
  const [summary, setSummary] = useState(false);
  const [menu, setMenu] = useState(false);
  if (!session) return <EmptyState title="Séance introuvable" text="Elle a peut-être été supprimée." action={<Button onClick={() => navigate('/training')}>Retour</Button>} />;
  const live = session.status === 'active';
  const wes = ctx.wexBySession.get(session.id) ?? [];
  const sets = ctx.setsBySession.get(session.id) ?? [];
  const doneCount = sets.filter((s) => s.done && !s.isWarmup).length;

  const finish = async () => {
    const pending = sets.filter((s) => !s.done).length;
    if (!doneCount) {
      if (await confirmDialog({ title: 'Aucune série validée', text: 'Veux-tu abandonner cette séance ? Elle ne sera pas enregistrée.', confirmLabel: 'Abandonner', danger: true })) {
        deleteSession(session.id);
        useRest.getState().skip();
        navigate('/training', { replace: true });
      }
      return;
    }
    if (pending && !(await confirmDialog({ title: 'Terminer la séance ?', text: `${pending} série${pending > 1 ? 's' : ''} non validée${pending > 1 ? 's' : ''} ne ser${pending > 1 ? 'ont' : 'a'} pas enregistrée${pending > 1 ? 's' : ''}.`, confirmLabel: 'Terminer' }))) return;
    finishSession(session.id);
    useRest.getState().skip();
    setSummary(true);
  };

  return (
    <div>
      <PageHeader
        title={
          <input
            className="bg-transparent outline-none w-full uppercase"
            value={session.name}
            onChange={(e) => store().upsert('sessions', { ...session, name: e.target.value })}
            aria-label="Nom de la séance"
            maxLength={50}
          />
        }
        subtitle={live ? <LiveClock startedAt={session.startedAt} sets={doneCount} volume={totalVolume(sets)} /> : `${formatDate(dateOf(session.startedAt), { weekday: 'long', day: 'numeric', month: 'long' })} · ${formatDuration(new Date(session.endedAt ?? session.startedAt).getTime() - new Date(session.startedAt).getTime())}`}
        backTo="/training"
        action={
          <>
            <IconButton label="Options de la séance" onClick={() => setMenu(true)}>
              <MoreHorizontal size={20} />
            </IconButton>
            {live && (
              <Button variant="primary" size="sm" icon={<Flag size={14} />} onClick={() => void finish()}>
                Terminer
              </Button>
            )}
          </>
        }
      />

      {!live && <SessionComparison ctx={ctx} sessionId={session.id} startedAt={session.startedAt} onOpen={() => setSummary(true)} />}

      <div className="space-y-4">
        {wes.map((we, i) => (
          <ExerciseBlock key={we.id} we={we} ctx={ctx} live={live} sets={sets.filter((s) => s.workoutExerciseId === we.id).sort((a, b) => a.position - b.position)} first={i === 0} last={i === wes.length - 1} startedAt={session.startedAt} />
        ))}
        {!wes.length && <EmptyState title="Séance vide" text="Ajoute un premier exercice pour commencer à enregistrer tes séries." />}
        <Button variant="secondary" size="lg" className="w-full" icon={<Plus size={18} />} onClick={() => setPicker(true)}>
          Ajouter un exercice
        </Button>
        <Card>
          <label className="label flex items-center gap-1.5">
            <StickyNote size={13} /> Notes de séance
          </label>
          <textarea className="field min-h-20" value={session.notes} placeholder="Sensations, énergie, matériel…" onChange={(e) => store().upsert('sessions', { ...session, notes: e.target.value })} maxLength={1000} />
        </Card>
      </div>

      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(id) => {
          addExerciseToSession(session.id, id);
          setPicker(false);
        }}
      />

      <Sheet open={menu} onClose={() => setMenu(false)} title="Séance">
        <div className="grid gap-2">
          {!live && (
            <Button className="justify-start" icon={<Trophy size={16} />} onClick={() => { setMenu(false); setSummary(true); }}>
              Voir le résumé
            </Button>
          )}
          <Button
            variant="danger"
            className="justify-start"
            icon={<Trash2 size={16} />}
            onClick={async () => {
              if (await confirmDialog({ title: live ? 'Abandonner la séance ?' : 'Supprimer la séance ?', text: 'Toutes ses séries seront supprimées.', confirmLabel: 'Supprimer', danger: true })) {
                deleteSession(session.id);
                useRest.getState().skip();
                navigate('/training', { replace: true });
              }
            }}
          >
            {live ? 'Abandonner la séance' : 'Supprimer la séance'}
          </Button>
        </div>
      </Sheet>

      {summary && <SummarySheet ctx={ctx} sessionId={session.id} onClose={() => setSummary(false)} />}
    </div>
  );
}

function LiveClock({ startedAt, sets, volume }: { startedAt: string; sets: number; volume: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="tnum">
      <span className="text-accent font-semibold">● {formatClock((now - new Date(startedAt).getTime()) / 1000)}</span> · {sets} séries · {fmtVolume(volume)}
    </span>
  );
}

function ExerciseBlock({ we, ctx, sets, live, first, last, startedAt }: { we: WorkoutExercise; ctx: Ctx; sets: WorkoutSet[]; live: boolean; first: boolean; last: boolean; startedAt: string }) {
  const ex = ctx.exById.get(we.exerciseId);
  const [menu, setMenu] = useState(false);
  const [noteOpen, setNoteOpen] = useState(!!we.note);
  const prefs = ctx.data.profile?.preferences;
  // Dernière performance AVANT cette séance
  const lastPerf = useMemo<ExercisePerformance | null>(() => {
    const h = exerciseHistory(we.exerciseId, ctx.doneSessions, ctx.data.sets, { excludeSessionId: we.sessionId }).filter((p) => p.startedAt < startedAt);
    return h[h.length - 1] ?? null;
  }, [ctx, we.exerciseId, we.sessionId, startedAt]);
  const target = we.repMax && we.repMin ? { sets: we.targetSets ?? 3, repMin: we.repMin, repMax: we.repMax } : null;
  const suggestion = live && target && ex ? progressionSuggestion(lastPerf, target, ex.loadIncrementKg) : null;
  const pendingAtSuggested = suggestion && sets.filter((s) => !s.done && !s.isWarmup).every((s) => s.weightKg === suggestion.suggestedWeightKg);
  let workIdx = 0;

  const onValidate = (s: WorkoutSet) => {
    if (s.done) {
      store().upsert('sets', { ...s, done: false, completedAt: null });
      return;
    }
    if (!s.reps || s.reps <= 0) {
      toast('Indique le nombre de répétitions', undefined, 'error');
      return;
    }
    unlockAudio();
    const res = validateSet(s);
    if (res.records.length && !s.isWarmup) {
      const main = res.records.find((r) => r.type === 'weight') ?? res.records.find((r) => r.type === 'reps') ?? res.records.find((r) => r.type === 'e1rm') ?? res.records[0];
      const prev = res.previousSameIndex;
      const detail =
        main.type === 'reps'
          ? `Tu viens de réaliser ${s.reps} répétitions à ${fmtSmart(s.weightKg ?? 0, 2)} kg contre ${main.previous} auparavant.`
          : main.type === 'weight'
            ? `Nouvelle charge maximale : ${fmtSmart(main.value, 2)} kg (précédent : ${fmtSmart(main.previous, 2)} kg).`
            : main.type === 'e1rm'
              ? `1RM estimé : ${fmtSmart(main.value, 1)} kg (précédent : ${fmtSmart(main.previous, 1)} kg).`
              : `${RECORD_LABELS[main.type]} : ${fmtSmart(main.value, 0)} kg.`;
      toast('Nouveau record !', `${ex?.name} — ${detail}${prev && main.type !== 'reps' ? ` Dernière séance : ${fmtSmart(prev.weightKg, 2)} kg × ${prev.reps}.` : ''}`, 'record', 6000);
      navigator.vibrate?.(60);
    }
    if (live && (prefs?.autoStartRest ?? true) && we.restSec > 0) useRest.getState().start(we.restSec, ex?.name ?? '');
  };

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-4">
        {ex && <MuscleDot muscle={ex.primaryMuscle} />}
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => navigate(`/exercises/${we.exerciseId}`)}>
          <div className="font-semibold truncate flex items-center gap-1">
            {ex?.name ?? 'Exercice'} <ChevronRight size={14} className="text-faint" />
          </div>
          <div className="text-xs text-muted flex items-center gap-2">
            {target && (
              <span>
                {target.sets} × {target.repMin}–{target.repMax}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Timer size={11} /> {formatClock(we.restSec)}
            </span>
          </div>
        </button>
        <IconButton label="Options de l'exercice" onClick={() => setMenu(true)}>
          <MoreHorizontal size={18} />
        </IconButton>
      </div>

      {lastPerf && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
          <History size={14} className="text-muted shrink-0" />
          <div className="text-xs text-muted min-w-0 flex-1 truncate">
            <span className="text-ink">{formatDate(lastPerf.date)}</span> : {lastPerf.sets.map((p) => `${fmtSmart(p.weightKg, 2)}×${p.reps}`).join(' · ')}
          </div>
          {live && (
            <button type="button" className="text-xs text-accent font-medium shrink-0 flex items-center gap-1" onClick={() => copyLastPerformance(we) && toast('Dernière séance copiée')}>
              <Copy size={12} /> Copier
            </button>
          )}
        </div>
      )}

      {suggestion && !pendingAtSuggested && (
        <div className="mx-4 mt-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5">
          <div className="flex gap-2 text-xs">
            <TrendingUp size={14} className="text-accent shrink-0 mt-px" />
            <span className="text-muted">{suggestion.reason}</span>
          </div>
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="primary" onClick={() => applyWeightToPendingSets(we, suggestion.suggestedWeightKg, target?.repMin)}>
              Appliquer {fmtSmart(suggestion.suggestedWeightKg, 2)} kg
            </Button>
          </div>
        </div>
      )}

      <div className="px-2 sm:px-4 pt-3 pb-1">
        <div className="grid grid-cols-[30px_minmax(0,1fr)_68px_56px_40px_28px] sm:grid-cols-[36px_minmax(0,1fr)_88px_72px_44px_32px] gap-1.5 text-[10px] uppercase tracking-wider text-faint px-1 pb-1">
          <span className="text-center">Série</span>
          <span>Précédent</span>
          <span className="text-center">kg</span>
          <span className="text-center">Reps</span>
          <span />
          <span />
        </div>
        {sets.map((s) => {
          const label = s.isWarmup ? 'É' : String(++workIdx);
          const prev = !s.isWarmup ? lastPerf?.sets[workIdx - 1] : undefined;
          const e1 = epley1RM(s.weightKg, s.reps);
          return (
            <div key={s.id} className={cx('grid grid-cols-[30px_minmax(0,1fr)_68px_56px_40px_28px] sm:grid-cols-[36px_minmax(0,1fr)_88px_72px_44px_32px] gap-1.5 items-center rounded-xl px-1 py-1 transition', s.done && 'bg-accent/8')}>
              <button
                type="button"
                className={cx('h-8 rounded-lg text-xs font-bold tnum', s.isWarmup ? 'text-warn bg-warn/10' : 'text-muted bg-surface-2')}
                onClick={() => store().upsert('sets', { ...s, isWarmup: !s.isWarmup })}
                title={s.isWarmup ? 'Échauffement (touche pour en faire une série de travail)' : 'Série de travail (touche pour marquer en échauffement)'}
                aria-label={s.isWarmup ? 'Série d\'échauffement' : `Série ${label}`}
              >
                {label}
              </button>
              <span className="text-xs text-muted tnum truncate" title={e1 ? `1RM estimé : ${fmtSmart(e1, 1)} kg` : undefined}>
                {prev ? `${fmtSmart(prev.weightKg, 2)} × ${prev.reps}` : '—'}
              </span>
              <NumberInput value={s.weightKg} onChange={(v) => store().upsert('sets', { ...s, weightKg: v })} className="[&_input]:!px-1 [&_input]:text-center [&_input]:h-9 [&_input]:!py-0" ariaLabel={`Charge série ${label}`} placeholder={prev ? String(prev.weightKg) : 'kg'} />
              <NumberInput value={s.reps} onChange={(v) => store().upsert('sets', { ...s, reps: v === null ? null : Math.round(v) })} inputMode="numeric" className="[&_input]:!px-1 [&_input]:text-center [&_input]:h-9 [&_input]:!py-0" ariaLabel={`Répétitions série ${label}`} placeholder={prev ? String(prev.reps) : 'reps'} onEnter={() => onValidate(s)} />
              <button
                type="button"
                onClick={() => onValidate(s)}
                className={cx('h-9 rounded-xl grid place-items-center transition active:scale-90', s.done ? 'bg-accent text-accent-ink' : 'bg-surface-3 text-muted hover:text-ink')}
                aria-label={s.done ? 'Annuler la validation' : 'Valider la série'}
                aria-pressed={s.done}
              >
                <Check size={18} strokeWidth={3} />
              </button>
              <button type="button" onClick={() => store().remove('sets', s.id)} className="h-9 grid place-items-center text-faint hover:text-danger" aria-label="Supprimer la série">
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 px-4 pb-4 pt-1">
        <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => addSet(we)} className="flex-1 border border-dashed border-line">
          Ajouter une série
        </Button>
        <Button size="sm" variant="ghost" icon={<StickyNote size={14} />} onClick={() => setNoteOpen(!noteOpen)}>
          Note
        </Button>
      </div>
      {noteOpen && (
        <div className="px-4 pb-4 -mt-2">
          <input className="field text-sm" value={we.note} placeholder="Réglage machine, sensations, technique…" onChange={(e) => store().upsert('workoutExercises', { ...we, note: e.target.value })} maxLength={300} />
        </div>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={ex?.name ?? 'Exercice'}>
        <div className="space-y-4">
          <div>
            <span className="label">Temps de repos après chaque série</span>
            <div className="grid grid-cols-4 gap-1.5">
              {REST_OPTIONS.map((r) => (
                <button key={r.value} type="button" onClick={() => store().upsert('workoutExercises', { ...we, restSec: r.value })} className={cx('h-9 rounded-lg text-sm border tnum', we.restSec === r.value ? 'border-accent text-accent bg-accent/10' : 'border-line text-muted')}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Button className="justify-start" icon={<ArrowUp size={16} />} disabled={first} onClick={() => moveSessionExercise(we.sessionId, we.id, -1)}>
              Monter
            </Button>
            <Button className="justify-start" icon={<ArrowDown size={16} />} disabled={last} onClick={() => moveSessionExercise(we.sessionId, we.id, 1)}>
              Descendre
            </Button>
            <Button
              variant="danger"
              className="justify-start"
              icon={<Trash2 size={16} />}
              onClick={async () => {
                if (await confirmDialog({ title: 'Retirer cet exercice ?', text: 'Ses séries de cette séance seront supprimées.', confirmLabel: 'Retirer', danger: true })) {
                  setMenu(false);
                  removeExerciseFromSession(we.id);
                }
              }}
            >
              Retirer de la séance
            </Button>
          </div>
        </div>
      </Sheet>
    </Card>
  );
}

function useComparisons(ctx: Ctx, sessionId: string) {
  return useMemo(() => {
    const session = ctx.data.sessions.find((s) => s.id === sessionId);
    if (!session) return [];
    const wes = ctx.wexBySession.get(sessionId) ?? [];
    const ids = [...new Set(wes.map((w) => w.exerciseId))];
    return ids
      .map((id) => {
        const cur = performanceFromSets(session, (ctx.setsBySession.get(sessionId) ?? []).filter((s) => s.exerciseId === id));
        const h = ctx.history(id).filter((p) => p.startedAt < session.startedAt);
        return cur ? { id, cur, cmp: comparePerformances(cur, h[h.length - 1]) } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }, [ctx, sessionId]);
}

function SessionComparison({ ctx, sessionId, onOpen }: { ctx: Ctx; sessionId: string; startedAt: string; onOpen: () => void }) {
  const list = useComparisons(ctx, sessionId);
  if (!list.length) return null;
  const up = list.filter((x) => x.cmp.kind === 'progress').length;
  const down = list.filter((x) => x.cmp.kind === 'regress').length;
  return (
    <Card onClick={onOpen} className="mb-4">
      <div className="flex items-center gap-3">
        <TrendingUp size={18} className="text-accent" />
        <div className="text-sm flex-1">
          <span className="font-semibold">{up}</span> exercice{up > 1 ? 's' : ''} en progrès
          {down > 0 && (
            <>
              , <span className="font-semibold">{down}</span> en baisse
            </>
          )}{' '}
          par rapport à la séance précédente.
        </div>
        <ChevronRight size={16} className="text-faint" />
      </div>
    </Card>
  );
}

function SummarySheet({ ctx, sessionId, onClose }: { ctx: Ctx; sessionId: string; onClose: () => void }) {
  const session = ctx.data.sessions.find((s) => s.id === sessionId);
  const list = useComparisons(ctx, sessionId);
  if (!session) return null;
  const sets = ctx.setsBySession.get(sessionId) ?? [];
  const records = list.flatMap((x) => {
    const h = ctx.history(x.id);
    const before = h.filter((p) => p.startedAt < session.startedAt).flatMap((p) => p.sets);
    if (!before.length) return [];
    const bestBefore = Math.max(...before.map((s) => epley1RM(s.weightKg, s.reps) ?? 0));
    const maxW = Math.max(...before.map((s) => s.weightKg));
    const out: string[] = [];
    if (x.cur.bestWeight > maxW) out.push(`${ctx.exById.get(x.id)?.name} : charge record ${fmtSmart(x.cur.bestWeight, 2)} kg`);
    else if ((x.cur.bestE1rm ?? 0) > bestBefore) out.push(`${ctx.exById.get(x.id)?.name} : 1RM estimé record ${fmtSmart(x.cur.bestE1rm, 1)} kg`);
    return out;
  });
  return (
    <Sheet open onClose={onClose} title="Résumé de la séance" footer={<Button variant="primary" onClick={() => { onClose(); navigate('/training/history'); }}>Terminé</Button>}>
      <div className="grid grid-cols-3 gap-3 text-center mb-5">
        <div className="card p-3">
          <div className="display text-2xl font-bold tnum">{session.endedAt ? formatDuration(new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) : '—'}</div>
          <div className="text-[11px] text-muted">Durée</div>
        </div>
        <div className="card p-3">
          <div className="display text-2xl font-bold tnum">{workingSets(sets).length}</div>
          <div className="text-[11px] text-muted">Séries</div>
        </div>
        <div className="card p-3">
          <div className="display text-2xl font-bold tnum">{fmtVolume(totalVolume(sets))}</div>
          <div className="text-[11px] text-muted">Volume</div>
        </div>
      </div>
      {records.length > 0 && (
        <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4 mb-5">
          <div className="flex items-center gap-2 font-semibold text-accent mb-2">
            <Trophy size={16} /> {records.length} record{records.length > 1 ? 's' : ''} battu{records.length > 1 ? 's' : ''}
          </div>
          <ul className="text-sm space-y-1">
            {records.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-3">
        {list.map((x) => (
          <div key={x.id} className="card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm">{ctx.exById.get(x.id)?.name}</span>
              <Badge tone={x.cmp.kind === 'progress' ? 'accent' : x.cmp.kind === 'regress' ? 'warn' : 'neutral'}>
                {x.cmp.kind === 'progress' ? 'Progrès' : x.cmp.kind === 'regress' ? 'En baisse' : x.cmp.kind === 'first' ? 'Première' : 'Stable'}
              </Badge>
            </div>
            <ul className="text-xs text-muted mt-1.5 space-y-0.5">
              {x.cmp.messages.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-faint mt-4">Les comparaisons portent sur la dernière séance où l'exercice a été réalisé. Le 1RM est une estimation (formule d'Epley).</p>
    </Sheet>
  );
}
