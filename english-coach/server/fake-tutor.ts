import type { Tutor } from './tutor.ts';

/**
 * Professeur factice, déterministe, pour les tests automatisés (EC_TUTOR=fake).
 * Il ne remplace jamais le vrai professeur en production.
 */
export const fakeTutor: Tutor = {
  async chat(input) {
    const last = [...input.history].reverse().find((m) => m.role === 'user');
    if (!last) return { reply: 'Hello! I am your English coach. How are you today?', corrections: [], vocabulary: [] };
    const corrections = /i am agree/i.test(last.text)
      ? [{ original: 'I am agree', corrected: 'I agree', explanation: 'En anglais, « agree » est un verbe : on dit « I agree », sans « am ».' }]
      : [];
    return { reply: 'Great! What do you usually do at the weekend?', corrections, vocabulary: [{ en: 'weekend', fr: 'week-end' }] };
  },
  async check(input) {
    const ok = /^i wish to learn english/i.test(input.answer.trim());
    return {
      acceptable: ok,
      corrected: input.accepted[0],
      explanation: ok ? '« I wish to » est correct, mais plus soutenu que « I want to ».' : 'La structure attendue est « want to + verbe ».',
    };
  },
};
