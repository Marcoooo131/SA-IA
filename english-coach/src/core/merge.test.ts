import { describe, expect, it } from 'vitest';
import { mergeStates } from './merge';
import { addStudyTime, advance, emptyState, recordAnswer, startLesson, type AppState } from './state';
import type { AnswerableExercise } from './exercises';

const TODAY = '2026-10-14';

function answerFirst(s: AppState, now: number): AppState {
  let st = startLesson(s, 1, now);
  st = advance(st, 'lesson', TODAY, now).state;
  const ex = st.sessions.lesson!.exercises[1] as AnswerableExercise;
  return recordAnswer(st, 'lesson', { answer: ex.accepted[0], verdict: 'correct', checkedBy: 'local' }, TODAY, now);
}

describe('fusion entre appareils', () => {
  it('ne perd aucune progression', () => {
    const phone = { ...emptyState(1), completed: { 1: { at: 10, date: TODAY, score: 8, total: 10 } }, activeDays: ['2026-10-13'] };
    const laptop = { ...emptyState(2), completed: { 2: { at: 20, date: TODAY, score: 10, total: 10 } }, activeDays: [TODAY] };
    const merged = mergeStates(phone, laptop);
    expect(Object.keys(merged.completed)).toEqual(['1', '2']);
    expect(merged.activeDays).toEqual(['2026-10-13', TODAY]);
  });

  it('garde la carte de révision la plus récente et réunit les réponses', () => {
    const a = answerFirst(emptyState(), 100);
    const b = answerFirst(emptyState(), 200);
    const merged = mergeStates(a, b);
    expect(merged.attempts).toHaveLength(2);
    const id = Object.keys(b.cards)[0];
    expect(merged.cards[id].updatedAt).toBe(200);
  });

  it('additionne le temps par appareil sans le doubler', () => {
    const a = addStudyTime(emptyState(), 'phone', 300, TODAY);
    const b = addStudyTime(mergeStates(emptyState(), a), 'laptop', 60, TODAY);
    const merged = mergeStates(a, b);
    expect(merged.time).toEqual({ phone: { [TODAY]: 300 }, laptop: { [TODAY]: 60 } });
    expect(mergeStates(merged, merged)).toEqual(merged);
  });

  it('une leçon terminée ailleurs ferme la session en cours restée sur ce téléphone', () => {
    const phone = answerFirst(emptyState(), 100);
    const laptop = { ...emptyState(), completed: { 1: { at: 500, date: TODAY, score: 10, total: 10 } } };
    expect(mergeStates(phone, laptop).sessions.lesson).toBeUndefined();
  });

  it('accepte un état distant vide ou incomplet', () => {
    const s = answerFirst(emptyState(), 100);
    expect(mergeStates(s, null).attempts).toHaveLength(1);
    expect(mergeStates(s, { completed: {} }).attempts).toHaveLength(1);
  });
});

describe('fusion sans changement', () => {
  it('renvoie le même objet quand rien ne change', async () => {
    const { mergeIfChanged } = await import('./merge');
    const s = answerFirst(emptyState(), 100);
    expect(mergeIfChanged(s, JSON.parse(JSON.stringify(s)))).toBe(s);
    expect(mergeIfChanged(s, answerFirst(emptyState(), 200))).not.toBe(s);
  });
});
