import { describe, expect, it } from 'vitest';
import {
  addExtraWord,
  addStudyTime,
  advance,
  currentDay,
  dueCards,
  emptyState,
  hydrate,
  isUnlocked,
  openMistakes,
  overrideAsCorrect,
  recordAnswer,
  saveDraft,
  secondsOn,
  startLesson,
  startMistakes,
  startReview,
  streak,
  type AppState,
} from './state';
import type { AnswerableExercise } from './exercises';
import { addDays } from './util';

const TODAY = '2026-10-14';

/** Répond à toute la leçon : « bien » partout sauf aux indices listés. */
function playLesson(state: AppState, day: number, wrongAt: number[] = [], today = TODAY): AppState {
  let s = startLesson(state, day);
  for (;;) {
    const session = s.sessions.lesson!;
    const ex = session.exercises[session.index];
    if (ex.type !== 'intro') {
      const wrong = wrongAt.includes(session.index);
      s = recordAnswer(s, 'lesson', { answer: wrong ? 'xxx' : ex.accepted[0], verdict: wrong ? 'wrong' : 'correct', checkedBy: 'local' }, today);
    }
    const r = advance(s, 'lesson', today);
    s = r.state;
    if (r.finished) return s;
  }
}

describe('déroulé d\'une leçon', () => {
  it('commence au jour 1 et ne débloque que la journée suivante', () => {
    const s = emptyState();
    expect(currentDay(s)).toBe(1);
    expect(isUnlocked(s, 1)).toBe(true);
    expect(isUnlocked(s, 2)).toBe(false);
  });

  it('enregistre les réponses, la progression et le jour du programme', () => {
    const s = playLesson(emptyState(), 1, [3]);
    expect(s.completed[1]).toMatchObject({ score: 9, total: 10 });
    expect(currentDay(s)).toBe(2);
    expect(isUnlocked(s, 2)).toBe(true);
    expect(s.attempts).toHaveLength(10);
    expect(Object.keys(s.cards)).toHaveLength(10);
    expect(s.activeDays).toEqual([TODAY]);
    expect(s.sessions.lesson).toBeUndefined();
    // L'erreur devient une « erreur à corriger » et une révision du jour même.
    expect(openMistakes(s)).toHaveLength(1);
    expect(dueCards(s, TODAY)).toHaveLength(1);
    expect(dueCards(s, addDays(TODAY, 1))).toHaveLength(10);
  });

  it('reprend exactement où on s\'était arrêté, brouillon compris', () => {
    let s = startLesson(emptyState(), 1);
    s = advance(s, 'lesson', TODAY).state; // fiche de cours
    const ex = s.sessions.lesson!.exercises[1] as AnswerableExercise;
    s = recordAnswer(s, 'lesson', { answer: ex.accepted[0], verdict: 'correct', checkedBy: 'local' }, TODAY);
    s = advance(s, 'lesson', TODAY).state;
    s = saveDraft(s, 'lesson', 'I want');
    // « Redémarrage » : on recharge l'état sérialisé
    const reloaded = hydrate(JSON.parse(JSON.stringify(s)));
    expect(reloaded.sessions.lesson!.index).toBe(2);
    expect(reloaded.sessions.lesson!.draft).toBe('I want');
    expect(startLesson(reloaded, 1)).toBe(reloaded);
  });

  it('ne compte pas deux fois la même réponse', () => {
    let s = startLesson(emptyState(), 1);
    s = advance(s, 'lesson', TODAY).state;
    const once = recordAnswer(s, 'lesson', { answer: 'a', verdict: 'wrong', checkedBy: 'local' }, TODAY);
    const twice = recordAnswer(once, 'lesson', { answer: 'b', verdict: 'correct', checkedBy: 'local' }, TODAY);
    expect(twice).toBe(once);
  });

  it('« Ma réponse était correcte » annule l\'erreur', () => {
    let s = startLesson(emptyState(), 1);
    s = advance(s, 'lesson', TODAY).state;
    s = recordAnswer(s, 'lesson', { answer: 'hiya', verdict: 'wrong', checkedBy: 'local' }, TODAY);
    expect(openMistakes(s)).toHaveLength(1);
    s = overrideAsCorrect(s, 'lesson', TODAY);
    expect(openMistakes(s)).toHaveLength(0);
    expect(s.sessions.lesson!.results[1].verdict).toBe('correct');
    expect(s.attempts.at(-1)!.verdict).toBe('correct');
    expect(dueCards(s, TODAY)).toHaveLength(0);
  });
});

describe('révisions et erreurs', () => {
  it('la révision reprend les éléments dus et repose une fois les réponses fausses', () => {
    let s = playLesson(emptyState(), 1, [], TODAY);
    const tomorrow = addDays(TODAY, 1);
    s = startReview(s, tomorrow, 1);
    const n = s.sessions.review!.exercises.length;
    expect(n).toBe(10);
    s = recordAnswer(s, 'review', { answer: 'nope', verdict: 'wrong', checkedBy: 'local' }, tomorrow);
    s = advance(s, 'review', tomorrow).state;
    expect(s.sessions.review!.exercises).toHaveLength(n + 1);
  });

  it('corriger une erreur la résout', () => {
    let s = playLesson(emptyState(), 1, [1]);
    s = startMistakes(s);
    const ex = s.sessions.mistakes!.exercises[0] as AnswerableExercise;
    s = recordAnswer(s, 'mistakes', { answer: ex.accepted[0], verdict: 'correct', checkedBy: 'local' }, TODAY);
    expect(openMistakes(s)).toHaveLength(0);
    const r = advance(s, 'mistakes', TODAY);
    expect(r.finished).toBe(true);
  });

  it('les mots ajoutés depuis la conversation entrent dans les révisions', () => {
    let s = addExtraWord(emptyState(), 'deadline', 'échéance', TODAY);
    s = startReview(s, TODAY);
    expect(s.sessions.review!.exercises[0]).toMatchObject({ type: 'word', prompt: 'échéance', accepted: ['deadline'] });
  });
});

describe('suivi', () => {
  it('calcule la série de jours consécutifs', () => {
    const s = { ...emptyState(), activeDays: ['2026-10-10', '2026-10-12', '2026-10-13', TODAY] };
    expect(streak(s, TODAY)).toBe(3);
    expect(streak(s, '2026-10-15')).toBe(3); // la journée en cours n'est pas encore perdue
    expect(streak(s, '2026-10-16')).toBe(0);
  });

  it('additionne le temps d\'étude de chaque appareil', () => {
    let s = addStudyTime(emptyState(), 'phone', 120, TODAY);
    s = addStudyTime(s, 'phone', 30, TODAY);
    s = addStudyTime(s, 'laptop', 60, TODAY);
    expect(secondsOn(s, TODAY)).toBe(210);
  });
});
