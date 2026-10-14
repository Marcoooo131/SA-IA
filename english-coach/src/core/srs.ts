import { addDays } from './util';

/**
 * Répétition espacée (système de boîtes à la Leitner) :
 * chaque bonne réponse fait monter l'élément d'une boîte et espace la révision suivante.
 */
export const INTERVALS = [0, 1, 2, 4, 7, 15, 30, 60];
/** À partir de cette boîte (révision espacée d'au moins 4 jours), un mot est considéré comme acquis. */
export const ACQUIRED_LEVEL = 4;

export interface Card {
  id: string;
  level: number;
  /** Date (AAAA-MM-JJ) à partir de laquelle l'élément est à réviser. */
  due: string;
  reps: number;
  lapses: number;
  lastReviewed: string;
  updatedAt: number;
}

export function reviewCard(card: Card | undefined, id: string, correct: boolean, today: string, now = Date.now()): Card {
  const base: Card = card ?? { id, level: 0, due: today, reps: 0, lapses: 0, lastReviewed: today, updatedAt: now };
  // Une même carte n'avance qu'une fois par jour : répondre deux fois dans la journée ne « triche » pas.
  const alreadyToday = card !== undefined && card.lastReviewed === today && card.reps > 0 && card.due > today;
  if (correct) {
    const level = alreadyToday ? base.level : Math.min(base.level + 1, INTERVALS.length - 1);
    return { ...base, level, due: addDays(today, INTERVALS[level]), reps: base.reps + 1, lastReviewed: today, updatedAt: now };
  }
  return { ...base, level: 0, due: today, reps: base.reps + 1, lapses: base.lapses + 1, lastReviewed: today, updatedAt: now };
}

export function isDue(card: Card, today: string): boolean {
  return card.due <= today;
}
