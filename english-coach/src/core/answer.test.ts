import { describe, expect, it } from 'vitest';
import { checkAnswer, normalize, variants } from './answer';

describe('correction des réponses', () => {
  it('ignore majuscules, ponctuation et espaces', () => {
    expect(checkAnswer('  i want to learn english ', ['I want to learn English.']).verdict).toBe('correct');
    expect(normalize('What’s up?!')).toBe("what's up");
  });

  it('accepte les contractions dans les deux sens', () => {
    expect(checkAnswer("I'm a student", ['I am a student.']).verdict).toBe('correct');
    expect(checkAnswer('She does not eat meat', ["She doesn't eat meat."]).verdict).toBe('correct');
    expect(checkAnswer("He's been to London", ['He has been to London.']).verdict).toBe('correct');
    expect(checkAnswer("It's raining", ['It is raining.']).verdict).toBe('correct');
    expect(checkAnswer('I cannot swim', ["I can't swim."]).verdict).toBe('correct');
    expect(checkAnswer("We won't go", ['We will not go.']).verdict).toBe('correct');
    expect(checkAnswer("I'd like a coffee", ['I would like a coffee.']).verdict).toBe('correct');
  });

  it('accepte une variante prévue', () => {
    expect(checkAnswer('I would like to learn English', ['I want to learn English.', 'I would like to learn English.']).closest).toBe(
      'I would like to learn English.',
    );
  });

  it('signale une simple faute de frappe sans la compter comme une erreur', () => {
    const r = checkAnswer('I want to lern English', ['I want to learn English.']);
    expect(r.verdict).toBe('typo');
  });

  it('refuse une réponse fausse ou vide', () => {
    expect(checkAnswer('I want learn English', ['I want to learn English.']).verdict).toBe('wrong');
    expect(checkAnswer('She don\'t eat meat', ["She doesn't eat meat."]).verdict).toBe('wrong');
    expect(checkAnswer('', ['hello']).verdict).toBe('wrong');
  });

  it('pas de tolérance aux fautes sur les mots très courts', () => {
    expect(checkAnswer('cat', ['car'], { wordMode: true }).verdict).toBe('wrong');
  });

  it('en mode « mot », ignore « to » et les articles', () => {
    expect(checkAnswer('to work', ['work'], { wordMode: true }).verdict).toBe('correct');
    expect(checkAnswer('a dog', ['dog'], { wordMode: true }).verdict).toBe('correct');
    expect(variants('the', true)).toEqual(['the']);
  });
});
