import {
  acceptedForWord,
  getItem,
  getLesson,
  itemsOfLesson,
  PROGRAM,
  sentenceId,
  wordId,
  type Lesson,
  type MemoItem,
  type Sentence,
  type Word,
} from '../curriculum';
import { normalize } from './answer';
import { seededRandom, shuffle } from './util';

interface Base {
  /** Clé stable de l'exercice (sert au journal des réponses). */
  key: string;
  /** Élément mémorisé concerné, absent pour les fiches de cours. */
  itemId?: string;
  /** Courte explication affichée après la correction. */
  explain?: string;
}

export type Exercise =
  | (Base & { type: 'intro'; title: string; text: string; examples: [string, string][]; goal: string })
  | (Base & { type: 'choice'; prompt: string; options: string[]; accepted: string[] })
  | (Base & { type: 'word'; prompt: string; accepted: string[] })
  | (Base & { type: 'translate'; prompt: string; accepted: string[] })
  | (Base & { type: 'order'; prompt: string; tiles: string[]; accepted: string[] })
  | (Base & { type: 'fill'; prompt: string; before: string; after: string; accepted: string[]; full: string });

export type AnswerableExercise = Exclude<Exercise, { type: 'intro' }>;

export const EXERCISE_TITLES: Record<Exercise['type'], string> = {
  intro: 'Le point du jour',
  choice: 'Choisis la bonne traduction',
  word: 'Écris le mot en anglais',
  translate: 'Traduis en anglais',
  order: 'Remets les mots dans l\'ordre',
  fill: 'Complète la phrase',
};

const GRAMMAR_WORDS = new Set(
  "am is are was were be been have has had will would should must can could might may did does do don't doesn't didn't isn't aren't wasn't won't going used than most since for ago who which where that if some any much many too enough so such yet just already ever never".split(
    ' ',
  ),
);

function lessonOf(day: number): Lesson {
  const lesson = getLesson(day);
  if (!lesson) throw new Error(`Jour inconnu : ${day}`);
  return lesson;
}

function grammarHint(day: number): string {
  const l = lessonOf(day);
  return `Point de grammaire (jour ${day}) : ${l.grammar.title}.`;
}

function wordExplain(word: Word): string {
  const alt = word.en.length > 1 ? ` (aussi : ${word.en.slice(1).join(', ')})` : '';
  return `« ${word.en[0]} » = ${word.fr}${alt}.`;
}

function sentenceExplain(day: number, sentence: Sentence): string {
  const others = sentence.en.slice(1, 3);
  return `${grammarHint(day)}${others.length ? ` Autres réponses possibles : ${others.join(' / ')}` : ''}`;
}

function splitTiles(text: string): string[] {
  return text.replace(/[.!?]+$/, '').split(/\s+/).filter(Boolean);
}

/** Trois mauvaises réponses plausibles, d'abord prises dans la même leçon. */
function distractors(word: Word, day: number, rand: () => number): string[] {
  const near = PROGRAM.filter((l) => l.kind === 'lesson' && Math.abs(l.day - day) <= 3).flatMap((l) => l.words);
  const pool = shuffle(near, rand)
    .filter((w) => w.fr !== word.fr && !w.en.some((e) => word.en.includes(e)))
    .map((w) => w.en[0]);
  return [...new Set(pool)].slice(0, 3);
}

export function makeWordExercise(item: Extract<MemoItem, { kind: 'word' }>, type: 'choice' | 'word', rand: () => number): Exercise {
  const { word, id, day } = item;
  const base = { key: `${type}:${id}`, itemId: id, explain: wordExplain(word), prompt: word.fr, accepted: acceptedForWord(word) };
  if (type === 'word') return { ...base, type: 'word' };
  const options = shuffle([word.en[0], ...distractors(word, day, rand)], rand);
  return { ...base, type: 'choice', options };
}

export function makeSentenceExercise(
  item: Extract<MemoItem, { kind: 'sentence' }>,
  type: 'translate' | 'order' | 'fill',
  rand: () => number,
): Exercise {
  const { sentence, id, day } = item;
  const base = { key: `${type}:${id}`, itemId: id, explain: sentenceExplain(day, sentence), prompt: sentence.fr };
  if (type === 'translate') return { ...base, type: 'translate', accepted: sentence.en };
  const tokens = splitTiles(sentence.en[0]);
  if (type === 'order' && tokens.length >= 3) {
    let tiles = shuffle(tokens, rand);
    for (let i = 0; i < 5 && tiles.join(' ') === tokens.join(' '); i++) tiles = shuffle(tokens, rand);
    return { ...base, type: 'order', tiles, accepted: [sentence.en[0]] };
  }
  if (type === 'fill' && tokens.length >= 3) {
    const candidates = tokens
      .map((t, i) => ({ t, i, n: normalize(t) }))
      .filter(({ t, i, n }) => n.length >= 2 && !(i > 0 && /^[A-Z]/.test(t) && n !== 'i'));
    const grammar = candidates.filter((c) => GRAMMAR_WORDS.has(c.n));
    const pickFrom = grammar.length ? grammar : [...candidates].sort((a, b) => b.n.length - a.n.length).slice(0, 3);
    const chosen = pickFrom[Math.floor(rand() * pickFrom.length)];
    if (chosen) {
      const full = sentence.en[0];
      const word = chosen.t.replace(/[.,!?]+$/, '');
      return {
        ...base,
        type: 'fill',
        before: tokens.slice(0, chosen.i).join(' '),
        after: [chosen.t.slice(word.length), ...tokens.slice(chosen.i + 1)].join(' ').trim(),
        accepted: [word],
        full,
      };
    }
  }
  return { ...base, type: 'translate', accepted: sentence.en };
}

function intro(lesson: Lesson): Exercise {
  return {
    type: 'intro',
    key: `intro:${lesson.day}`,
    title: lesson.grammar.title,
    text: lesson.grammar.text,
    examples: lesson.grammar.examples,
    goal: lesson.goal,
  };
}

/** Exercices d'une journée du programme : toujours les mêmes pour un même jour (reprise fiable). */
export function buildLessonExercises(day: number): Exercise[] {
  const lesson = lessonOf(day);
  const rand = seededRandom(`day-${day}`);
  if (lesson.kind === 'lesson') {
    const w = (i: number) => ({ kind: 'word' as const, id: wordId(day, i), day, word: lesson.words[i] });
    const s = (i: number) => ({ kind: 'sentence' as const, id: sentenceId(day, i), day, sentence: lesson.sentences[i] });
    return [
      intro(lesson),
      makeWordExercise(w(0), 'choice', rand),
      makeWordExercise(w(1), 'choice', rand),
      makeWordExercise(w(2), 'word', rand),
      makeSentenceExercise(s(0), 'translate', rand),
      makeWordExercise(w(3), 'word', rand),
      makeSentenceExercise(s(1), 'order', rand),
      makeWordExercise(w(4), 'choice', rand),
      makeSentenceExercise(s(2), 'fill', rand),
      makeWordExercise(w(5), 'word', rand),
      makeSentenceExercise(s(3), 'translate', rand),
    ];
  }
  const items = itemsOfLesson(day);
  const words = shuffle(items.filter((i) => i.kind === 'word'), rand);
  const sentences = shuffle(items.filter((i) => i.kind === 'sentence'), rand);
  const plan =
    lesson.kind === 'review'
      ? { word: 4, choice: 2, translate: 2, order: 1, fill: 1 }
      : { word: 6, choice: 2, translate: 7, order: 2, fill: 3 };
  const ex: Exercise[] = [];
  let wi = 0;
  let si = 0;
  for (let k = 0; k < plan.word; k++) ex.push(makeWordExercise(words[wi++] as never, 'word', rand));
  for (let k = 0; k < plan.choice; k++) ex.push(makeWordExercise(words[wi++] as never, 'choice', rand));
  for (let k = 0; k < plan.translate; k++) ex.push(makeSentenceExercise(sentences[si++] as never, 'translate', rand));
  for (let k = 0; k < plan.order; k++) ex.push(makeSentenceExercise(sentences[si++] as never, 'order', rand));
  for (let k = 0; k < plan.fill; k++) ex.push(makeSentenceExercise(sentences[si++] as never, 'fill', rand));
  return [intro(lesson), ...shuffle(ex, rand)];
}

/** Exercice de révision d'un élément : on demande toujours de produire l'anglais. */
export function reviewExercise(itemId: string, seed: string): Exercise | undefined {
  const item = getItem(itemId);
  if (!item) return undefined;
  const rand = seededRandom(`${seed}-${itemId}`);
  if (item.kind === 'word') return makeWordExercise(item, 'word', rand);
  return makeSentenceExercise(item, rand() < 0.25 ? 'order' : 'translate', rand);
}

/** Mot ajouté depuis la conversation écrite (hors programme). */
export function extraWordExercise(id: string, en: string, fr: string): Exercise {
  return { type: 'word', key: `word:${id}`, itemId: id, prompt: fr, accepted: [en], explain: `« ${en} » = ${fr} (vu en conversation).` };
}
