import { PROGRAM } from '../curriculum';
import { apiFetch } from './api';
import { ensureAccount } from './sync';
import type { ChatCorrection, ChatMessage } from './state';

/** Appels au professeur IA (toujours en ligne : rien n'est simulé hors connexion). */

export interface TutorReply {
  reply: string;
  corrections: ChatCorrection[];
  vocabulary: { en: string; fr: string }[];
}

export interface CheckReply {
  acceptable: boolean;
  corrected: string;
  explanation: string;
}

export const SCENARIOS: { id: string; label: string; title: string }[] = [
  { id: 'free', label: 'Discussion libre', title: 'Discussion libre' },
  { id: 'restaurant', label: 'Au restaurant', title: 'Au restaurant' },
  { id: 'travel', label: "À l'hôtel", title: "À l'hôtel" },
  { id: 'job', label: "Entretien d'embauche", title: "Entretien d'embauche" },
  { id: 'work', label: 'Entre collègues', title: 'Entre collègues' },
  { id: 'email', label: 'Rédiger un e-mail', title: 'Rédiger un e-mail' },
];

function topicsUpTo(day: number): string[] {
  return PROGRAM.filter((l) => l.kind === 'lesson' && l.day <= day)
    .slice(-12)
    .map((l) => l.grammar.title);
}

async function key(): Promise<string> {
  const k = await ensureAccount();
  if (!k) throw new Error('no-account');
  return k;
}

export async function askTutor(scenario: string, day: number, messages: ChatMessage[]): Promise<TutorReply> {
  const history = messages.slice(-30).map((m) => ({ role: m.role, text: m.text.slice(0, 2000) }));
  return apiFetch<TutorReply>('/tutor/chat', {
    method: 'POST',
    key: await key(),
    timeoutMs: 60_000,
    body: JSON.stringify({ scenario, day: Math.min(Math.max(day, 1), 90), topics: topicsUpTo(day), history }),
  });
}

export async function checkWithTutor(prompt: string, accepted: string[], answer: string, day: number): Promise<CheckReply> {
  return apiFetch<CheckReply>('/tutor/check', {
    method: 'POST',
    key: await key(),
    timeoutMs: 20_000,
    body: JSON.stringify({ prompt, accepted: accepted.slice(0, 10), answer: answer.slice(0, 400), day: Math.min(Math.max(day, 1), 90) }),
  });
}
