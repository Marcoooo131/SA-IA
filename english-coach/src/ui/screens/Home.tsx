import { AlertTriangle, ChevronRight, Clock, Download, Flame, Play, Repeat, Trophy } from 'lucide-react';
import { getLesson, PROGRAM_DAYS } from '../../curriculum';
import { currentDay, dueCards, isProgramFinished, openMistakes, secondsOn, streak } from '../../core/state';
import { setMeta, useAppState, useMeta } from '../../core/store';
import { formatMinutes } from '../../core/util';
import { Page, ProgressBar } from '../components/Page';
import { isStandalone } from '../pwa';
import { navigate } from '../router';

export function Home() {
  const state = useAppState();
  const meta = useMeta();
  const day = currentDay(state);
  const lesson = getLesson(day)!;
  const done = Object.keys(state.completed).length;
  const finished = isProgramFinished(state);
  const session = state.sessions.lesson;
  const resume = session && session.day !== undefined ? session : undefined;
  const resumeLesson = resume ? getLesson(resume.day!) : undefined;
  const due = dueCards(state).length;
  const mistakes = openMistakes(state).length;
  const today = secondsOn(state);
  const goal = state.settings.dailyGoalMin * 60;
  const serie = streak(state);
  const showInstall = !isStandalone() && !meta.installHintDismissed;

  const target = resumeLesson ?? lesson;
  return (
    <Page title="English Coach" subtitle="Ton professeur d'anglais écrit">
      <section className="card hero" aria-labelledby="today-title">
        <div className="eyebrow">
          <span>
            Jour {target.day} / {PROGRAM_DAYS}
          </span>
          <span>{Math.round((done / PROGRAM_DAYS) * 100)} % du programme</span>
        </div>
        <ProgressBar value={done / PROGRAM_DAYS} label="Progression du programme de 90 jours" />
        <h2 id="today-title">{finished && !resume ? 'Programme terminé !' : target.title}</h2>
        <p>
          {resume
            ? `Reprends à l'exercice ${Math.min(resume.index + 1, resume.exercises.length)} sur ${resume.exercises.length}.`
            : finished
              ? 'Bravo, tu as terminé les 90 jours. Continue tes révisions pour garder ton niveau.'
              : target.goal}
        </p>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => navigate(finished && !resume ? '/review' : `/lesson/${target.day}`)}
        >
          <Play size={20} aria-hidden="true" />
          {finished && !resume ? 'Réviser' : 'Continuer mon cours'}
        </button>
      </section>

      <section className="stats" aria-label="Ma journée">
        <div className="stat">
          <Clock size={20} aria-hidden="true" />
          <strong>{formatMinutes(today)}</strong>
          <span>aujourd'hui · objectif {state.settings.dailyGoalMin} min</span>
          <div style={{ marginTop: 6 }}>
            <ProgressBar value={today / goal} label="Objectif du jour" />
          </div>
        </div>
        <a className="stat" href="#/review">
          <Repeat size={20} aria-hidden="true" />
          <strong>{due}</strong>
          <span>{due > 1 ? 'révisions en attente' : 'révision en attente'}</span>
        </a>
        <div className="stat">
          <Flame size={20} aria-hidden="true" />
          <strong>{serie}</strong>
          <span>{serie > 1 ? 'jours de suite' : 'jour de suite'}</span>
        </div>
      </section>

      {mistakes > 0 && (
        <a className="card" href="#/review" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'inherit', textDecoration: 'none' }}>
          <AlertTriangle size={22} color="var(--ko)" aria-hidden="true" />
          <span style={{ flex: 1 }}>
            <strong>{mistakes} erreur{mistakes > 1 ? 's' : ''} à corriger</strong>
            <br />
            <span className="hint">Reprends-les pour les ancrer.</span>
          </span>
          <ChevronRight size={20} aria-hidden="true" />
        </a>
      )}

      {done > 0 && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Trophy size={22} color="var(--accent)" aria-hidden="true" />
          <span>
            {done} journée{done > 1 ? 's' : ''} terminée{done > 1 ? 's' : ''} sur {PROGRAM_DAYS}.
          </span>
        </div>
      )}

      {showInstall && (
        <section className="card">
          <h2>Installer English Coach</h2>
          <p className="hint">Ajoute l'application à ton écran d'accueil pour l'ouvrir en un geste, en plein écran.</p>
          <div className="row" style={{ marginTop: 10 }}>
            <a className="btn btn-secondary btn-small" href="#/install">
              <Download size={18} aria-hidden="true" /> Comment faire
            </a>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setMeta({ installHintDismissed: true })}>
              Plus tard
            </button>
          </div>
        </section>
      )}
    </Page>
  );
}
