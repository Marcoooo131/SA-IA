import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight, Check, CheckCircle2, Loader2, Sparkles, X, XCircle } from 'lucide-react';
import { getLesson, PROGRAM_DAYS } from '../../curriculum';
import { checkAnswer } from '../../core/answer';
import { EXERCISE_TITLES, type AnswerableExercise, type Exercise } from '../../core/exercises';
import {
  advance,
  currentDay,
  dueCards,
  isUnlocked,
  overrideAsCorrect,
  recordAnswer,
  saveDraft,
  sessionScore,
  startLesson,
  startMistakes,
  startReview,
  type ExerciseResult,
  type SessionKind,
} from '../../core/state';
import { getState, setState, useAppState } from '../../core/store';
import { scheduleSync } from '../../core/sync';
import { checkWithTutor } from '../../core/tutor';
import { ApiError, errorMessage } from '../../core/api';
import { ProgressBar } from '../components/Page';
import { useOnline } from '../pwa';
import { navigate } from '../router';

interface Summary {
  kind: SessionKind;
  day?: number;
  score: number;
  total: number;
}

const EXIT: Record<SessionKind, string> = { lesson: '/', review: '/review', mistakes: '/review' };

export function SessionScreen({ kind, day }: { kind: SessionKind; day?: number }) {
  const state = useAppState();
  const [summary, setSummary] = useState<Summary | null>(null);
  const session = state.sessions[kind];
  const lockedLesson = kind === 'lesson' && day !== undefined && (!getLesson(day) || !isUnlocked(state, day));

  // Démarre (ou reprend) la session à l'ouverture de l'écran.
  useEffect(() => {
    if (summary) return;
    const s = getState();
    if (kind === 'lesson' && day !== undefined && !lockedLesson && s.sessions.lesson?.day !== day) setState((st) => startLesson(st, day));
    if (kind === 'review' && !s.sessions.review && dueCards(s).length) setState((st) => startReview(st));
    if (kind === 'mistakes' && !s.sessions.mistakes && Object.values(s.mistakes).some((m) => !m.resolved)) setState((st) => startMistakes(st));
  }, [kind, day, lockedLesson, summary]);

  if (summary) return <SummaryView summary={summary} />;

  if (lockedLesson) {
    return (
      <Shell onClose={() => navigate('/learn')} progress={0} counter="">
        <div className="card">
          <h2>Journée verrouillée</h2>
          <p>Termine d'abord la journée {currentDay(state)} pour débloquer celle-ci.</p>
        </div>
        <Footer>
          <button type="button" className="btn btn-primary btn-block" onClick={() => navigate(`/lesson/${currentDay(state)}`)}>
            Aller à la leçon du jour
          </button>
        </Footer>
      </Shell>
    );
  }

  if (!session || (kind === 'lesson' && session.day !== day)) {
    const empty = kind !== 'lesson';
    return (
      <Shell onClose={() => navigate(EXIT[kind])} progress={0} counter="">
        {empty ? (
          <div className="card empty">
            <CheckCircle2 size={40} color="var(--ok)" aria-hidden="true" />
            <h2 style={{ marginTop: 8 }}>{kind === 'review' ? 'Aucune révision en attente' : 'Aucune erreur à corriger'}</h2>
            <p>Reviens plus tard : les éléments à revoir apparaissent ici au bon moment.</p>
          </div>
        ) : (
          <p className="empty">Préparation de la leçon…</p>
        )}
        {empty && (
          <Footer>
            <button type="button" className="btn btn-primary btn-block" onClick={() => navigate(EXIT[kind])}>
              Retour
            </button>
          </Footer>
        )}
      </Shell>
    );
  }

  const exercise = session.exercises[session.index];
  const result = session.results[session.index];
  const total = session.exercises.length;

  function onContinue() {
    const before = getState().sessions[kind];
    const { score, total: answered } = before ? sessionScore(before) : { score: 0, total: 0 };
    let finished = false;
    setState((s) => {
      const r = advance(s, kind);
      finished = r.finished;
      return r.state;
    });
    if (finished) {
      setSummary({ kind, day: before?.day, score, total: answered });
      scheduleSync(500);
    }
  }

  return (
    <Shell
      onClose={() => navigate(EXIT[kind])}
      progress={(session.index + (result || exercise.type === 'intro' ? 1 : 0)) / total}
      counter={`${session.index + 1}/${total}`}
    >
      <ExerciseView
        key={`${session.id}-${session.index}`}
        kind={kind}
        exercise={exercise}
        result={result}
        draft={session.draft ?? ''}
        day={session.day ?? currentDay(state)}
        onContinue={onContinue}
      />
    </Shell>
  );
}

function Shell({ onClose, progress, counter, children }: { onClose: () => void; progress: number; counter: string; children: React.ReactNode }) {
  return (
    <div className="fullscreen" role="dialog" aria-modal="true" aria-label="Exercices">
      <header className="fs-header">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer (la progression est sauvegardée)">
          <X size={24} aria-hidden="true" />
        </button>
        <ProgressBar value={progress} label="Avancement de la série" />
        <span className="counter">{counter}</span>
      </header>
      {children}
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <div className="fs-body">
      <div className="inner">{children}</div>
    </div>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <footer className="fs-footer">
      <div className="inner">{children}</div>
    </footer>
  );
}

function checkLocal(ex: AnswerableExercise, value: string) {
  const wordMode = ex.type === 'word' || ex.type === 'fill' || ex.type === 'choice';
  return checkAnswer(value, ex.accepted, { wordMode });
}

function ExerciseView(props: {
  kind: SessionKind;
  exercise: Exercise;
  result?: ExerciseResult;
  draft: string;
  day: number;
  onContinue: () => void;
}) {
  const { kind, exercise, result, day, onContinue } = props;
  const online = useOnline();
  const [value, setValue] = useState(props.draft);
  const [picked, setPicked] = useState<number[]>([]);
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const continueRef = useRef<HTMLButtonElement | null>(null);

  // Brouillon sauvegardé : fermer l'application au milieu d'une phrase ne la fait pas perdre.
  useEffect(() => {
    if (result || exercise.type === 'intro' || exercise.type === 'order' || exercise.type === 'choice') return;
    const t = setTimeout(() => setState((s) => saveDraft(s, kind, value)), 400);
    return () => clearTimeout(t);
  }, [value, result, exercise.type, kind]);

  useEffect(() => {
    if (result) {
      (document.activeElement as HTMLElement | null)?.blur?.();
      continueRef.current?.focus({ preventScroll: true });
    } else if (exercise.type === 'word' || exercise.type === 'translate' || exercise.type === 'fill') {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [result, exercise.type]);

  if (exercise.type === 'intro') {
    const lesson = getLesson(day);
    return (
      <>
        <Body>
          <span className="ex-kind">
            {lesson?.kind === 'lesson' ? `Jour ${day} sur ${PROGRAM_DAYS}` : lesson?.title}
          </span>
          <h1 className="ex-prompt">{exercise.title}</h1>
          <p className="subtitle">{exercise.goal}</p>
          <div className="card">
            <p className="grammar-text">{exercise.text}</p>
          </div>
          {exercise.examples.length > 0 && (
            <ul className="examples" aria-label="Exemples">
              {exercise.examples.map(([en, fr]) => (
                <li key={en} lang="en">
                  <strong>{en}</strong>
                  <span lang="fr">{fr}</span>
                </li>
              ))}
            </ul>
          )}
        </Body>
        <Footer>
          <button type="button" className="btn btn-primary btn-block" onClick={onContinue} autoFocus>
            Commencer les exercices <ArrowRight size={20} aria-hidden="true" />
          </button>
        </Footer>
      </>
    );
  }

  const ex = exercise;
  const orderValue = ex.type === 'order' ? picked.map((i) => ex.tiles[i]).join(' ') : '';
  const current = ex.type === 'order' ? orderValue : value;
  const canSubmit = current.trim().length > 0 && !checking && !result;

  async function submit(answer: string) {
    if (!answer.trim() || checking || result) return;
    const local = checkLocal(ex, answer);
    // Pour un mot, la correction affichée est la forme de référence ; pour une phrase, la variante la plus proche.
    const reference = ex.type === 'translate' || ex.type === 'order' ? local.closest : ex.accepted[0];
    let res: ExerciseResult = { answer: answer.trim(), verdict: local.verdict, checkedBy: 'local', corrected: local.verdict === 'wrong' ? reference : local.closest };
    if (local.verdict === 'typo') res.note = `Attention à l'orthographe : « ${local.closest} ».`;
    // Une traduction libre peut être juste sans figurer dans la liste : on demande au professeur IA.
    if (ex.type === 'translate' && local.verdict === 'wrong') {
      if (!navigator.onLine) {
        res.note = 'Hors connexion : ta réponse a été comparée aux réponses attendues. Le professeur IA ne peut pas vérifier une autre formulation sans Internet.';
      } else {
        setChecking(true);
        try {
          const ai = await checkWithTutor(ex.prompt, ex.accepted, answer, day);
          res = ai.acceptable
            ? { answer: res.answer, verdict: 'correct', checkedBy: 'ai', note: ai.explanation, corrected: ai.corrected || local.closest }
            : { answer: res.answer, verdict: 'wrong', checkedBy: 'ai', note: ai.explanation, corrected: ai.corrected || local.closest };
        } catch (err) {
          const why = err instanceof ApiError ? errorMessage(err) : 'Professeur IA indisponible.';
          res.note = `${why} Ta réponse a été comparée aux réponses attendues.`;
        } finally {
          setChecking(false);
        }
      }
    }
    setState((s) => recordAnswer(s, kind, res));
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit(value);
    }
  }

  const inputClass = result ? (result.verdict === 'wrong' ? ' ko' : ' ok') : '';
  const textProps = {
    value,
    onChange: (e: { target: { value: string } }) => setValue(e.target.value),
    onKeyDown: onKey,
    readOnly: Boolean(result) || checking,
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    lang: 'en',
    enterKeyHint: 'done' as const,
  };

  return (
    <>
      <Body>
        <span className="ex-kind">{EXERCISE_TITLES[ex.type]}</span>
        <h1 className="ex-prompt" lang="fr">
          {ex.prompt}
        </h1>

        {ex.type === 'choice' && (
          <div className="choices" role="group" aria-label="Propositions">
            {ex.options.map((opt) => {
              const isAnswer = opt === ex.accepted[0];
              const cls = result ? (isAnswer ? ' ok' : opt === result.answer ? ' ko' : '') : '';
              return (
                <button key={opt} type="button" lang="en" className={`choice${cls}`} disabled={Boolean(result)} onClick={() => void submit(opt)}>
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {(ex.type === 'word' || ex.type === 'translate') && (
          <>
            <label htmlFor="answer" className="sr-only">
              Ta réponse en anglais
            </label>
            <textarea
              id="answer"
              ref={(el) => {
                inputRef.current = el;
              }}
              className={`answer-input${inputClass}`}
              rows={ex.type === 'translate' ? 3 : 1}
              placeholder="Écris ta réponse ici"
              autoCapitalize={ex.type === 'word' ? 'none' : 'sentences'}
              {...textProps}
            />
            {!result && <p className="hint">Appuie sur Entrée ou sur le bouton pour vérifier.</p>}
          </>
        )}

        {ex.type === 'fill' && (
          <>
            <p className="fill-sentence" lang="en">
              {ex.before}{' '}
              <input
                ref={(el) => {
                  inputRef.current = el;
                }}
                className={`fill-input${inputClass}`}
                aria-label="Mot manquant"
                autoCapitalize="none"
                placeholder="…"
                {...textProps}
              />{' '}
              {ex.after}
            </p>
            {!result && <p className="hint">Écris le mot manquant.</p>}
          </>
        )}

        {ex.type === 'order' && (
          <>
            <div className="tile-target" aria-label="Ta phrase" lang="en">
              {picked.map((i, pos) => (
                <button key={`${i}-${pos}`} type="button" className="tile" disabled={Boolean(result)} onClick={() => setPicked(picked.filter((_, p) => p !== pos))}>
                  {ex.tiles[i]}
                </button>
              ))}
            </div>
            <div className="tiles" aria-label="Mots disponibles" lang="en">
              {ex.tiles.map((t, i) => (
                <button key={`${t}-${i}`} type="button" className="tile" disabled={picked.includes(i) || Boolean(result)} onClick={() => setPicked([...picked, i])}>
                  {t}
                </button>
              ))}
            </div>
          </>
        )}

        {result && <Feedback exercise={ex} result={result} onOverride={() => setState((s) => overrideAsCorrect(s, kind))} />}
      </Body>
      <Footer>
        {result ? (
          <button ref={continueRef} type="button" className={`btn btn-block ${result.verdict === 'wrong' ? 'btn-ko' : 'btn-ok'}`} onClick={onContinue}>
            Continuer <ArrowRight size={20} aria-hidden="true" />
          </button>
        ) : ex.type === 'choice' ? (
          <p className="hint" style={{ textAlign: 'center' }}>
            Touche la bonne réponse.
          </p>
        ) : (
          <button type="button" className="btn btn-primary btn-block" disabled={!canSubmit} onClick={() => void submit(current)}>
            {checking ? (
              <>
                <Loader2 size={20} className="spin" aria-hidden="true" /> Le professeur IA vérifie…
              </>
            ) : (
              'Vérifier ma réponse'
            )}
          </button>
        )}
        {!result && ex.type === 'translate' && !online && <p className="hint">Hors connexion : correction par comparaison aux réponses attendues.</p>}
      </Footer>
    </>
  );
}

function Feedback({ exercise, result, onOverride }: { exercise: AnswerableExercise; result: ExerciseResult; onOverride: () => void }) {
  const ok = result.verdict !== 'wrong';
  const expected = exercise.type === 'fill' ? exercise.full : result.corrected || exercise.accepted[0];
  const title = result.verdict === 'typo' ? 'Presque parfait !' : ok ? (result.checkedBy === 'self' ? 'Réponse validée par toi' : 'Bonne réponse !') : 'Pas tout à fait…';
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, []);
  return (
    <section ref={ref} className={`feedback ${ok ? 'ok' : 'ko'}`} role="status" aria-live="polite">
      <span className="verdict">
        {ok ? <Check size={22} aria-hidden="true" /> : <XCircle size={22} aria-hidden="true" />} {title}
      </span>
      {(!ok || result.verdict === 'typo' || exercise.type === 'fill') && (
        <span>
          {ok ? 'Réponse : ' : 'Correction : '}
          <span className="expected" lang="en">
            {expected}
          </span>
        </span>
      )}
      {!ok && result.answer && exercise.type !== 'choice' && (
        <span className="explain">
          Ta réponse : <span lang="en">{result.answer}</span>
        </span>
      )}
      {result.note && (
        <span className="explain">
          {result.checkedBy === 'ai' && <Sparkles size={14} aria-label="Professeur IA" style={{ verticalAlign: '-2px', marginRight: 4 }} />}
          {result.note}
        </span>
      )}
      {exercise.explain && <span className="explain">{exercise.explain}</span>}
      {!ok && result.checkedBy === 'local' && (exercise.type === 'translate' || exercise.type === 'word') && (
        <button type="button" className="link-btn" onClick={onOverride}>
          Ma réponse était correcte
        </button>
      )}
    </section>
  );
}

function SummaryView({ summary }: { summary: Summary }) {
  const state = useAppState();
  const due = dueCards(state).length;
  const pct = summary.total ? Math.round((summary.score / summary.total) * 100) : 100;
  const next = summary.day ? summary.day + 1 : undefined;
  const title =
    summary.kind === 'lesson'
      ? summary.day === PROGRAM_DAYS
        ? 'Programme terminé, félicitations !'
        : `Jour ${summary.day} terminé !`
      : summary.kind === 'review'
        ? 'Révision terminée'
        : 'Erreurs reprises';
  const message = pct >= 90 ? 'Excellent travail !' : pct >= 70 ? 'Très bien, continue comme ça.' : 'Les éléments à revoir reviendront dans tes révisions.';
  const primary = useMemo(() => {
    if (summary.kind === 'lesson' && due > 0) return { label: `Réviser maintenant (${due})`, to: '/session/review' };
    return { label: "Retour à l'accueil", to: '/' };
  }, [summary.kind, due]);
  return (
    <Shell onClose={() => navigate('/')} progress={1} counter="">
      <Body>
        <div className="card" style={{ textAlign: 'center' }}>
          <CheckCircle2 size={44} color="var(--ok)" aria-hidden="true" />
          <h1 className="ex-prompt" style={{ marginTop: 8 }}>
            {title}
          </h1>
          <p className="result-score">{pct} %</p>
          <p>
            {summary.score} bonne{summary.score > 1 ? 's' : ''} réponse{summary.score > 1 ? 's' : ''} sur {summary.total}. {message}
          </p>
        </div>
      </Body>
      <Footer>
        <button type="button" className="btn btn-primary btn-block" onClick={() => navigate(primary.to)} autoFocus>
          {primary.label}
        </button>
        {summary.kind === 'lesson' && next && next <= PROGRAM_DAYS && isUnlocked(state, next) && (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => navigate(`/lesson/${next}`)}>
            Journée suivante
          </button>
        )}
        {primary.to !== '/' && (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => navigate('/')}>
            Retour à l'accueil
          </button>
        )}
      </Footer>
    </Shell>
  );
}
