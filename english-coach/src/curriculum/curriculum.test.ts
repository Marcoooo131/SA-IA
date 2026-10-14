import { describe, expect, it } from 'vitest';
import { getItem, itemsOfLesson, PROGRAM, PROGRAM_DAYS } from '.';
import { buildLessonExercises } from '../core/exercises';
import { checkAnswer, normalize } from '../core/answer';

describe('programme de 90 jours', () => {
  it('contient 90 journées numérotées, un bilan tous les 7 jours et une évaluation finale', () => {
    expect(PROGRAM).toHaveLength(PROGRAM_DAYS);
    PROGRAM.forEach((l, i) => expect(l.day).toBe(i + 1));
    expect(PROGRAM.filter((l) => l.kind === 'review').map((l) => l.day)).toEqual([7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 77, 84]);
    expect(PROGRAM[89].kind).toBe('final');
    expect(PROGRAM.filter((l) => l.kind === 'lesson')).toHaveLength(77);
  });

  it('chaque leçon a une explication, 6 mots, 4 phrases et des exemples', () => {
    for (const l of PROGRAM.filter((x) => x.kind === 'lesson')) {
      expect(l.title, `jour ${l.day}`).toBeTruthy();
      expect(l.grammar.text.length, `jour ${l.day}`).toBeGreaterThan(40);
      expect(l.grammar.examples.length, `jour ${l.day}`).toBeGreaterThan(0);
      expect(l.words, `jour ${l.day}`).toHaveLength(6);
      expect(l.sentences, `jour ${l.day}`).toHaveLength(4);
      for (const w of l.words) expect(w.en.length && w.fr, `jour ${l.day}`).toBeTruthy();
      for (const s of l.sentences) {
        expect(s.fr && s.en.length, `jour ${l.day}`).toBeTruthy();
        expect(s.en.every((e) => e.trim().length > 0)).toBe(true);
      }
    }
  });

  it('aucun mot n\'apparaît deux fois avec la même traduction dans une même leçon', () => {
    for (const l of PROGRAM.filter((x) => x.kind === 'lesson')) {
      const fr = l.words.map((w) => w.fr);
      expect(new Set(fr).size, `jour ${l.day}`).toBe(fr.length);
    }
  });

  it('les identifiants d\'éléments se résolvent', () => {
    const items = itemsOfLesson(12);
    expect(items).toHaveLength(10);
    for (const i of items) expect(getItem(i.id)).toBeTruthy();
    expect(itemsOfLesson(7)).toHaveLength(60);
  });
});

describe('exercices générés', () => {
  it('sont identiques d\'un chargement à l\'autre (reprise fiable)', () => {
    expect(buildLessonExercises(5)).toEqual(buildLessonExercises(5));
    expect(buildLessonExercises(14)).toEqual(buildLessonExercises(14));
  });

  it('chaque journée produit une série valide, et la réponse attendue est acceptée par le correcteur', () => {
    for (let day = 1; day <= PROGRAM_DAYS; day++) {
      const ex = buildLessonExercises(day);
      expect(ex[0].type).toBe('intro');
      expect(ex.length, `jour ${day}`).toBeGreaterThanOrEqual(11);
      const keys = ex.map((e) => e.key);
      expect(new Set(keys).size, `jour ${day}`).toBe(keys.length);
      for (const e of ex) {
        if (e.type === 'intro') continue;
        const wordMode = e.type !== 'translate' && e.type !== 'order';
        expect(checkAnswer(e.accepted[0], e.accepted, { wordMode }).verdict, `${e.key}`).toBe('correct');
        if (e.type === 'choice') {
          expect(e.options).toHaveLength(4);
          expect(e.options).toContain(e.accepted[0]);
          expect(new Set(e.options).size).toBe(4);
        }
        if (e.type === 'order') {
          expect(normalize([...e.tiles].sort().join(' '))).toBe(normalize(e.accepted[0].replace(/[.!?]+$/, '').split(/\s+/).sort().join(' ')));
          expect(checkAnswer(e.accepted[0].replace(/[.!?]+$/, ''), e.accepted).verdict).toBe('correct');
        }
        if (e.type === 'fill') {
          expect(normalize(`${e.before} ${e.accepted[0]} ${e.after}`)).toBe(normalize(e.full));
        }
      }
    }
  });
});
