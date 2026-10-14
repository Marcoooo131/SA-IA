import type { Lesson, LessonSource, Sentence, Word } from './types';
import { WEEKS_1_4 } from './weeks01-04';
import { WEEKS_5_8 } from './weeks05-08';
import { WEEKS_9_13 } from './weeks09-13';

export type { Lesson, Word, Sentence } from './types';

export const PROGRAM_DAYS = 90;
const SOURCES: LessonSource[] = [...WEEKS_1_4, ...WEEKS_5_8, ...WEEKS_9_13];

export function parseWords(spec: string): Word[] {
  return spec
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf('=');
      if (eq < 0) throw new Error(`Mot mal formé : « ${part} »`);
      const en = part.slice(0, eq).split('/').map((s) => s.trim()).filter(Boolean);
      const fr = part.slice(eq + 1).trim().replace(/\//g, ' / ');
      return { en, fr };
    });
}

export function parseSentence(spec: string): Sentence {
  const eq = spec.indexOf('=');
  if (eq < 0) throw new Error(`Phrase mal formée : « ${spec} »`);
  const en = spec.slice(eq + 1).split('|').map((s) => s.trim()).filter(Boolean);
  return { fr: spec.slice(0, eq).trim(), en };
}

function fromSource(src: LessonSource, day: number): Lesson {
  const [gTitle, gText, ...examples] = src.grammar;
  return {
    day,
    week: Math.ceil(day / 7),
    kind: 'lesson',
    title: src.title,
    goal: src.goal,
    grammar: {
      title: gTitle,
      text: gText,
      examples: examples.map((e) => {
        const [en, fr] = e.split('|');
        return [en.trim(), (fr ?? '').trim()];
      }),
    },
    words: parseWords(src.words),
    sentences: src.sentences.map(parseSentence),
  };
}

function buildProgram(): Lesson[] {
  const lessons: Lesson[] = [];
  let next = 0;
  for (let day = 1; day <= PROGRAM_DAYS; day++) {
    if (day === PROGRAM_DAYS) {
      const content = lessons.filter((l) => l.kind === 'lesson');
      lessons.push({
        day,
        week: 13,
        kind: 'final',
        title: 'Évaluation finale',
        goal: 'Mesurer tout le chemin parcouru en 90 jours.',
        grammar: {
          title: 'Bilan du programme',
          text: "Cette évaluation reprend des mots et des phrases de tout le programme. Prends ton temps : l'objectif est de voir ce que tu maîtrises et ce qu'il reste à revoir.",
          examples: [],
        },
        words: content.flatMap((l) => l.words),
        sentences: content.flatMap((l) => l.sentences),
      });
    } else if (day % 7 === 0) {
      const week = day / 7;
      const ofWeek = lessons.filter((l) => l.week === week && l.kind === 'lesson');
      lessons.push({
        day,
        week,
        kind: 'review',
        title: `Bilan de la semaine ${week}`,
        goal: 'Consolider les leçons de la semaine.',
        grammar: {
          title: 'Points vus cette semaine',
          text: ofWeek.map((l) => `• ${l.grammar.title}`).join('\n'),
          examples: [],
        },
        words: ofWeek.flatMap((l) => l.words),
        sentences: ofWeek.flatMap((l) => l.sentences),
      });
    } else {
      const src = SOURCES[next++];
      if (!src) throw new Error(`Contenu manquant pour le jour ${day}`);
      lessons.push(fromSource(src, day));
    }
  }
  if (next !== SOURCES.length) throw new Error(`${SOURCES.length - next} leçon(s) non placée(s)`);
  return lessons;
}

export const PROGRAM: Lesson[] = buildProgram();

export function getLesson(day: number): Lesson | undefined {
  return PROGRAM[day - 1];
}

/** Toutes les réponses anglaises acceptées pour un même libellé français, sur tout le programme. */
const ACCEPTED_BY_FR = new Map<string, Set<string>>();
for (const lesson of PROGRAM) {
  if (lesson.kind !== 'lesson') continue;
  for (const w of lesson.words) {
    const set = ACCEPTED_BY_FR.get(w.fr) ?? new Set<string>();
    w.en.forEach((e) => set.add(e));
    ACCEPTED_BY_FR.set(w.fr, set);
  }
}

export function acceptedForWord(word: Word): string[] {
  const all = ACCEPTED_BY_FR.get(word.fr);
  return [...word.en, ...[...(all ?? [])].filter((e) => !word.en.includes(e))];
}

/** Identifiants stables des éléments mémorisables : « w:<jour>:<index> » ou « s:<jour>:<index> ». */
export function wordId(day: number, index: number) {
  return `w:${day}:${index}`;
}
export function sentenceId(day: number, index: number) {
  return `s:${day}:${index}`;
}

export type MemoItem =
  | { kind: 'word'; id: string; day: number; word: Word }
  | { kind: 'sentence'; id: string; day: number; sentence: Sentence };

/** Retrouve un mot ou une phrase à partir de son identifiant (les bilans pointent vers les leçons d'origine). */
export function getItem(id: string): MemoItem | undefined {
  const [kind, d, i] = id.split(':');
  const lesson = getLesson(Number(d));
  if (!lesson || lesson.kind !== 'lesson') return undefined;
  if (kind === 'w') {
    const word = lesson.words[Number(i)];
    return word && { kind: 'word', id, day: lesson.day, word };
  }
  if (kind === 's') {
    const sentence = lesson.sentences[Number(i)];
    return sentence && { kind: 'sentence', id, day: lesson.day, sentence };
  }
  return undefined;
}

/** Éléments mémorisables introduits par une leçon (ou, pour un bilan, ceux des leçons couvertes). */
export function itemsOfLesson(day: number): MemoItem[] {
  const lesson = getLesson(day);
  if (!lesson) return [];
  const sources =
    lesson.kind === 'lesson'
      ? [lesson]
      : lesson.kind === 'review'
        ? PROGRAM.filter((l) => l.week === lesson.week && l.kind === 'lesson')
        : PROGRAM.filter((l) => l.kind === 'lesson');
  return sources.flatMap((l) => [
    ...l.words.map((word, i) => ({ kind: 'word' as const, id: wordId(l.day, i), day: l.day, word })),
    ...l.sentences.map((sentence, i) => ({ kind: 'sentence' as const, id: sentenceId(l.day, i), day: l.day, sentence })),
  ]);
}
