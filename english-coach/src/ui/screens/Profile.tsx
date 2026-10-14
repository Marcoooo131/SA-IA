import { PROGRAM_DAYS } from '../../curriculum';
import { accuracy, setDailyGoal, totalSeconds, vocabularyStats, streak } from '../../core/state';
import { setState, useAppState } from '../../core/store';
import { formatMinutes } from '../../core/util';
import { Page } from '../components/Page';
import { InstallCard, SyncCard } from '../platform';

const GOALS = [5, 10, 15, 20, 30];

export function Profile() {
  const state = useAppState();
  const done = Object.keys(state.completed).length;
  const vocab = vocabularyStats(state);
  const acc = accuracy(state);

  return (
    <Page title="Profil" subtitle="Ta progression et tes réglages">
      <section className="stats" aria-label="Bilan">
        <div className="stat">
          <strong>
            {done}/{PROGRAM_DAYS}
          </strong>
          <span>journées terminées</span>
        </div>
        <div className="stat">
          <strong>{vocab.acquired}</strong>
          <span>mots acquis ({vocab.seen} vus)</span>
        </div>
        <div className="stat">
          <strong>{acc === null ? '—' : `${Math.round(acc * 100)} %`}</strong>
          <span>de réussite récente</span>
        </div>
        <div className="stat">
          <strong>{formatMinutes(totalSeconds(state))}</strong>
          <span>d'apprentissage au total</span>
        </div>
        <div className="stat">
          <strong>{streak(state)}</strong>
          <span>{streak(state) > 1 ? 'jours de suite' : 'jour de suite'}</span>
        </div>
        <div className="stat">
          <strong>{state.activeDays.length}</strong>
          <span>{state.activeDays.length > 1 ? "jours d'étude" : "jour d'étude"}</span>
        </div>
      </section>

      <section className="card">
        <h2>Objectif quotidien</h2>
        <p className="hint">Minutes d'apprentissage visées chaque jour.</p>
        <div className="segmented" role="group" aria-label="Objectif quotidien en minutes">
          {GOALS.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={state.settings.dailyGoalMin === g}
              aria-label={`${g} minutes`}
              onClick={() => setState((s) => setDailyGoal(s, g))}
            >
              {g}
            </button>
          ))}
        </div>
      </section>

      <InstallCard />
      <SyncCard />

      <section className="card">
        <h2>À propos</h2>
        <p className="hint">
          English Coach est un professeur d'anglais <strong>écrit</strong> : aucune fonctionnalité vocale. Les leçons et révisions fonctionnent sans le
          professeur IA ; celui-ci (conversation et vérification des traductions libres) nécessite une connexion Internet.
        </p>
      </section>
    </Page>
  );
}

