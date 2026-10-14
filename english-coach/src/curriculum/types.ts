/** Un mot de vocabulaire : la forme anglaise attendue et ses variantes acceptées. */
export interface Word {
  /** Réponses anglaises acceptées ; la première est la forme de référence. */
  en: string[];
  /** Traduction française affichée comme consigne. */
  fr: string;
}

/** Une phrase à traduire du français vers l'anglais. */
export interface Sentence {
  fr: string;
  /** Traductions acceptées ; la première est la correction affichée. */
  en: string[];
}

export interface Grammar {
  title: string;
  /** Explication courte en français. */
  text: string;
  /** Exemples : [anglais, français]. */
  examples: [string, string][];
}

export type LessonKind = 'lesson' | 'review' | 'final';

export interface Lesson {
  day: number;
  week: number;
  kind: LessonKind;
  title: string;
  /** Objectif en une phrase, affiché sur la carte de la leçon. */
  goal: string;
  grammar: Grammar;
  words: Word[];
  sentences: Sentence[];
}

/** Forme compacte utilisée pour écrire le programme. */
export interface LessonSource {
  title: string;
  goal: string;
  grammar: [title: string, text: string, ...examples: string[]];
  /** "anglais/variante=français; …" */
  words: string;
  /** "Phrase française=traduction 1|traduction 2" */
  sentences: string[];
}
