import { PROGRAM_DAYS, itemsOfLesson } from '../curriculum';
import type { Verdict } from './answer';
import { buildLessonExercises, extraWordExercise, reviewExercise, type AnswerableExercise, type Exercise } from './exercises';
import { ACQUIRED_LEVEL, isDue, reviewCard, type Card } from './srs';
import { localDate, uid, shuffle, seededRandom, addDays } from './util';

export const STATE_VERSION = 1;
const MAX_ATTEMPTS = 3000;
export const MAX_REVIEW_ITEMS = 20;

export type SessionKind = 'lesson' | 'review' | 'mistakes';

export interface ExerciseResult {
  answer: string;
  verdict: Verdict;
  /** Qui a validé : la correction locale, le professeur IA, ou l'utilisateur lui-même. */
  checkedBy: 'local' | 'ai' | 'self';
  note?: string;
  corrected?: string;
}

export interface Session {
  id: string;
  kind: SessionKind;
  day?: number;
  exercises: Exercise[];
  index: number;
  results: Record<number, ExerciseResult>;
  /** Réponse en cours de saisie, pour la retrouver après une fermeture de l'application. */
  draft?: string;
  startedAt: number;
  updatedAt: number;
}

export interface Attempt {
  id: string;
  at: number;
  date: string;
  mode: SessionKind;
  day?: number;
  key: string;
  itemId?: string;
  answer: string;
  verdict: Verdict;
}

export interface Mistake {
  itemId: string;
  exercise: AnswerableExercise;
  answer: string;
  expected: string;
  count: number;
  resolved: boolean;
  at: number;
  updatedAt: number;
}

export interface ChatCorrection {
  original: string;
  corrected: string;
  explanation: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'tutor';
  text: string;
  at: number;
  corrections?: ChatCorrection[];
  vocabulary?: { en: string; fr: string }[];
}

export interface ChatThread {
  id: string;
  scenario: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface CompletedLesson {
  at: number;
  date: string;
  score: number;
  total: number;
}

export interface Settings {
  dailyGoalMin: number;
  updatedAt: number;
}

export interface AppState {
  version: number;
  createdAt: number;
  updatedAt: number;
  completed: Record<number, CompletedLesson>;
  cards: Record<string, Card>;
  attempts: Attempt[];
  mistakes: Record<string, Mistake>;
  activeDays: string[];
  /** Secondes d'apprentissage par appareil puis par jour (additionnées entre appareils). */
  time: Record<string, Record<string, number>>;
  sessions: Partial<Record<SessionKind, Session>>;
  chats: Record<string, ChatThread>;
  /** Mots ajoutés depuis la conversation : traduction mémorisée hors programme. */
  extraWords: Record<string, { en: string; fr: string; at: number }>;
  settings: Settings;
}

export function emptyState(now = Date.now()): AppState {
  return {
    version: STATE_VERSION,
    createdAt: now,
    updatedAt: now,
    completed: {},
    cards: {},
    attempts: [],
    mistakes: {},
    activeDays: [],
    time: {},
    sessions: {},
    chats: {},
    extraWords: {},
    settings: { dailyGoalMin: 15, updatedAt: 0 },
  };
}

/** Complète un état chargé (ancienne version, champ manquant) sans perdre de données. */
export function hydrate(raw: unknown): AppState {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppState>;
  return {
    ...base,
    ...r,
    version: STATE_VERSION,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    sessions: r.sessions ?? {},
    attempts: Array.isArray(r.attempts) ? r.attempts : [],
    activeDays: Array.isArray(r.activeDays) ? r.activeDays : [],
  };
}

// ——— Lecture ———

/** Jour du programme : la première journée non terminée. */
export function currentDay(state: AppState): number {
  for (let d = 1; d <= PROGRAM_DAYS; d++) if (!state.completed[d]) return d;
  return PROGRAM_DAYS;
}

export function isProgramFinished(state: AppState): boolean {
  return Object.keys(state.completed).length >= PROGRAM_DAYS;
}

export function isUnlocked(state: AppState, day: number): boolean {
  return day === 1 || Boolean(state.completed[day - 1]) || Boolean(state.completed[day]);
}

export function dueCards(state: AppState, today = localDate()): Card[] {
  return Object.values(state.cards)
    .filter((c) => isDue(c, today))
    .sort((a, b) => a.due.localeCompare(b.due) || a.level - b.level);
}

export function openMistakes(state: AppState): Mistake[] {
  return Object.values(state.mistakes)
    .filter((m) => !m.resolved)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function secondsOn(state: AppState, date = localDate()): number {
  return Object.values(state.time).reduce((sum, byDate) => sum + (byDate[date] ?? 0), 0);
}

export function totalSeconds(state: AppState): number {
  return Object.values(state.time).reduce((sum, byDate) => sum + Object.values(byDate).reduce((a, b) => a + b, 0), 0);
}

/** Série de jours consécutifs ; elle reste valable tant que la journée d'hier a été travaillée. */
export function streak(state: AppState, today = localDate()): number {
  const days = new Set(state.activeDays);
  let cursor = days.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (days.has(cursor)) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}

export function vocabularyStats(state: AppState) {
  const words = Object.values(state.cards).filter((c) => c.id.startsWith('w:'));
  const acquired = words.filter((c) => c.level >= ACQUIRED_LEVEL).length;
  return { seen: words.length, acquired, learning: words.length - acquired };
}

export function accuracy(state: AppState): number | null {
  const recent = state.attempts.slice(-200);
  if (!recent.length) return null;
  return recent.filter((a) => a.verdict !== 'wrong').length / recent.length;
}

// ——— Écriture (fonctions pures : elles renvoient un nouvel état) ———

function touch(state: AppState, now: number): AppState {
  return { ...state, updatedAt: now };
}

export function startLesson(state: AppState, day: number, now = Date.now()): AppState {
  const existing = state.sessions.lesson;
  if (existing && existing.day === day) return state;
  const session: Session = { id: uid('s_'), kind: 'lesson', day, exercises: buildLessonExercises(day), index: 0, results: {}, startedAt: now, updatedAt: now };
  return touch({ ...state, sessions: { ...state.sessions, lesson: session } }, now);
}

export function startReview(state: AppState, today = localDate(), now = Date.now()): AppState {
  const due = dueCards(state, today).slice(0, MAX_REVIEW_ITEMS);
  const rand = seededRandom(`review-${now}`);
  const exercises = shuffle(due, rand)
    .map((c) => {
      const extra = state.extraWords[c.id];
      return extra ? extraWordExercise(c.id, extra.en, extra.fr) : reviewExercise(c.id, String(now));
    })
    .filter((e): e is Exercise => Boolean(e));
  const session: Session = { id: uid('s_'), kind: 'review', exercises, index: 0, results: {}, startedAt: now, updatedAt: now };
  return touch({ ...state, sessions: { ...state.sessions, review: session } }, now);
}

export function startMistakes(state: AppState, now = Date.now()): AppState {
  const exercises = openMistakes(state)
    .slice(0, MAX_REVIEW_ITEMS)
    .map((m) => m.exercise);
  const session: Session = { id: uid('s_'), kind: 'mistakes', exercises, index: 0, results: {}, startedAt: now, updatedAt: now };
  return touch({ ...state, sessions: { ...state.sessions, mistakes: session } }, now);
}

export function saveDraft(state: AppState, kind: SessionKind, draft: string, now = Date.now()): AppState {
  const session = state.sessions[kind];
  if (!session || session.draft === draft) return state;
  return touch({ ...state, sessions: { ...state.sessions, [kind]: { ...session, draft, updatedAt: now } } }, now);
}

function markActive(state: AppState, date: string): string[] {
  return state.activeDays.includes(date) ? state.activeDays : [...state.activeDays, date].sort();
}

/** Enregistre la réponse à l'exercice courant : journal, mémorisation, erreurs à corriger. */
export function recordAnswer(
  state: AppState,
  kind: SessionKind,
  result: ExerciseResult,
  today = localDate(),
  now = Date.now(),
): AppState {
  const session = state.sessions[kind];
  if (!session) return state;
  const exercise = session.exercises[session.index];
  if (!exercise || exercise.type === 'intro' || session.results[session.index]) return state;

  const correct = result.verdict !== 'wrong';
  const attempt: Attempt = {
    id: uid('a_'),
    at: now,
    date: today,
    mode: kind,
    day: session.day,
    key: exercise.key,
    itemId: exercise.itemId,
    answer: result.answer,
    verdict: result.verdict,
  };
  let cards = state.cards;
  let mistakes = state.mistakes;
  if (exercise.itemId) {
    cards = { ...cards, [exercise.itemId]: reviewCard(cards[exercise.itemId], exercise.itemId, correct, today, now) };
    const previous = mistakes[exercise.itemId];
    if (!correct) {
      mistakes = {
        ...mistakes,
        [exercise.itemId]: {
          itemId: exercise.itemId,
          exercise,
          answer: result.answer,
          expected: exercise.accepted[0],
          count: (previous?.count ?? 0) + 1,
          resolved: false,
          at: previous?.at ?? now,
          updatedAt: now,
        },
      };
    } else if (previous && !previous.resolved) {
      mistakes = { ...mistakes, [exercise.itemId]: { ...previous, resolved: true, updatedAt: now } };
    }
  }
  const nextSession: Session = { ...session, results: { ...session.results, [session.index]: result }, draft: '', updatedAt: now };
  return touch(
    {
      ...state,
      cards,
      mistakes,
      attempts: [...state.attempts, attempt].slice(-MAX_ATTEMPTS),
      activeDays: markActive(state, today),
      sessions: { ...state.sessions, [kind]: nextSession },
    },
    now,
  );
}

export function sessionScore(session: Session) {
  const answered = Object.values(session.results);
  return { score: answered.filter((r) => r.verdict !== 'wrong').length, total: answered.length };
}

/**
 * Passe à l'exercice suivant. En révision, une réponse fausse est reposée une fois en fin de série.
 * Renvoie l'état et indique si la session est terminée.
 */
export function advance(state: AppState, kind: SessionKind, today = localDate(), now = Date.now()): { state: AppState; finished: boolean } {
  const session = state.sessions[kind];
  if (!session) return { state, finished: true };
  let exercises = session.exercises;
  const current = exercises[session.index];
  const result = session.results[session.index];
  if (kind !== 'lesson' && current && result?.verdict === 'wrong' && current.type !== 'intro') {
    const retries = exercises.filter((e) => e.key === current.key).length;
    if (retries < 2) exercises = [...exercises, current];
  }
  const index = session.index + 1;
  if (index < exercises.length) {
    return { state: touch({ ...state, sessions: { ...state.sessions, [kind]: { ...session, exercises, index, draft: '', updatedAt: now } } }, now), finished: false };
  }
  // Session terminée
  const sessions = { ...state.sessions };
  delete sessions[kind];
  let completed = state.completed;
  if (kind === 'lesson' && session.day) {
    const { score, total } = sessionScore(session);
    const before = completed[session.day];
    completed = { ...completed, [session.day]: { at: before?.at ?? now, date: before?.date ?? today, score: Math.max(score, before?.score ?? 0), total } };
  }
  return { state: touch({ ...state, sessions, completed, activeDays: markActive(state, today) }, now), finished: true };
}

export function abandonSession(state: AppState, kind: SessionKind, now = Date.now()): AppState {
  const sessions = { ...state.sessions };
  delete sessions[kind];
  return touch({ ...state, sessions }, now);
}

export function addStudyTime(state: AppState, deviceId: string, seconds: number, date = localDate(), now = Date.now()): AppState {
  if (seconds <= 0) return state;
  const mine = state.time[deviceId] ?? {};
  return touch({ ...state, time: { ...state.time, [deviceId]: { ...mine, [date]: (mine[date] ?? 0) + seconds } } }, now);
}

export function setDailyGoal(state: AppState, minutes: number, now = Date.now()): AppState {
  return touch({ ...state, settings: { ...state.settings, dailyGoalMin: minutes, updatedAt: now } }, now);
}

export function upsertChat(state: AppState, thread: ChatThread, now = Date.now()): AppState {
  return touch({ ...state, chats: { ...state.chats, [thread.id]: thread } }, now);
}

export function deleteChat(state: AppState, id: string, now = Date.now()): AppState {
  // Un fil supprimé est vidé (et non retiré) pour que la synchronisation propage la suppression.
  const thread = state.chats[id];
  if (!thread) return state;
  return touch({ ...state, chats: { ...state.chats, [id]: { ...thread, messages: [], title: '', updatedAt: now } } }, now);
}

/** Les mots découverts en conversation rejoignent les révisions (« x:<mot> »). */
export function addExtraWord(state: AppState, en: string, fr: string, today = localDate(), now = Date.now()): AppState {
  const id = `x:${en.toLowerCase().trim()}`;
  if (state.extraWords[id]) return state;
  return touch(
    {
      ...state,
      extraWords: { ...state.extraWords, [id]: { en, fr, at: now } },
      cards: { ...state.cards, [id]: { id, level: 0, due: today, reps: 0, lapses: 0, lastReviewed: today, updatedAt: now } },
    },
    now,
  );
}

/** Nombre d'éléments à apprendre dans une leçon (pour les cartes du programme). */
export function lessonSize(day: number): number {
  return itemsOfLesson(day).length;
}

/**
 * « Ma réponse était correcte » : l'utilisateur reprend la main sur une correction locale
 * trop stricte (formulation non prévue). L'élément n'est pas compté comme une erreur.
 */
export function overrideAsCorrect(state: AppState, kind: SessionKind, today = localDate(), now = Date.now()): AppState {
  const session = state.sessions[kind];
  const result = session?.results[session.index];
  const exercise = session?.exercises[session.index];
  if (!session || !result || result.verdict !== 'wrong' || !exercise) return state;
  let cards = state.cards;
  let mistakes = state.mistakes;
  if (exercise.itemId) {
    const card = cards[exercise.itemId];
    if (card) cards = { ...cards, [exercise.itemId]: { ...card, level: Math.max(card.level, 1), due: addDays(today, 1), lapses: Math.max(0, card.lapses - 1), updatedAt: now } };
    const m = mistakes[exercise.itemId];
    if (m) mistakes = { ...mistakes, [exercise.itemId]: { ...m, resolved: true, updatedAt: now } };
  }
  const lastIndex = state.attempts.findLastIndex((a) => a.key === exercise.key);
  const attempts = lastIndex < 0 ? state.attempts : state.attempts.map((a, i) => (i === lastIndex ? { ...a, verdict: 'correct' as const } : a));
  const results = { ...session.results, [session.index]: { ...result, verdict: 'correct' as const, checkedBy: 'self' as const } };
  return touch({ ...state, cards, mistakes, attempts, sessions: { ...state.sessions, [kind]: { ...session, results, updatedAt: now } } }, now);
}
