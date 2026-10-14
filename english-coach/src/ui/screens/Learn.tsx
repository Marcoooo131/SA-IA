import { Check, ChevronRight, Lock } from 'lucide-react';
import { PROGRAM, PROGRAM_DAYS } from '../../curriculum';
import { currentDay, isUnlocked } from '../../core/state';
import { useAppState } from '../../core/store';
import { Page, ProgressBar } from '../components/Page';
import { navigate } from '../router';

const WEEKS = Array.from({ length: 13 }, (_, i) => i + 1);
const LEVELS: Record<number, string> = { 1: 'A1', 5: 'A2', 9: 'B1' };

export function Learn() {
  const state = useAppState();
  const today = currentDay(state);
  const inProgress = state.sessions.lesson?.day;
  const done = Object.keys(state.completed).length;

  return (
    <Page title="Apprendre" subtitle={`Programme de ${PROGRAM_DAYS} jours · ${done} terminé${done > 1 ? 's' : ''}`}>
      <ProgressBar value={done / PROGRAM_DAYS} label="Progression du programme" />
      {WEEKS.map((week) => {
        const days = PROGRAM.filter((l) => l.week === week);
        const weekDone = days.filter((d) => state.completed[d.day]).length;
        const level = LEVELS[week] ?? (week < 5 ? 'A1' : week < 9 ? 'A2' : 'B1');
        return (
          <details key={week} className="card week" open={days.some((d) => d.day === today)}>
            <summary>
              <span>
                Semaine {week} <span className="pill">{level}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="hint">
                  {weekDone}/{days.length}
                </span>
                <ChevronRight className="chev" size={20} aria-hidden="true" />
              </span>
            </summary>
            <ul className="days">
              {days.map((l) => {
                const completed = state.completed[l.day];
                const unlocked = isUnlocked(state, l.day);
                const current = l.day === today && !completed;
                const status = completed
                  ? `Terminé · ${completed.score}/${completed.total}`
                  : inProgress === l.day
                    ? 'En cours'
                    : current
                      ? 'Leçon du jour'
                      : unlocked
                        ? 'Disponible'
                        : 'Termine la journée précédente';
                return (
                  <li key={l.day}>
                    <button
                      type="button"
                      className={`day${completed ? ' done' : ''}${current ? ' current' : ''}`}
                      disabled={!unlocked}
                      onClick={() => navigate(`/lesson/${l.day}`)}
                      aria-label={`Jour ${l.day} : ${l.title}. ${status}`}
                    >
                      <span className="num">{completed ? <Check size={18} aria-hidden="true" /> : l.day}</span>
                      <span className="info">
                        <strong>{l.title}</strong>
                        <span>{status}</span>
                      </span>
                      {unlocked ? <ChevronRight size={18} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </Page>
  );
}
