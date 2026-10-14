import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

/** Professeur d'anglais écrit : conversation corrigée et validation des traductions libres. */

export const ChatReply = z.object({
  reply: z.string(),
  corrections: z.array(z.object({ original: z.string(), corrected: z.string(), explanation: z.string() })),
  vocabulary: z.array(z.object({ en: z.string(), fr: z.string() })),
});
export type ChatReply = z.infer<typeof ChatReply>;

export const CheckReply = z.object({
  acceptable: z.boolean(),
  corrected: z.string(),
  explanation: z.string(),
});
export type CheckReply = z.infer<typeof CheckReply>;

export interface ChatInput {
  scenario: string;
  day: number;
  topics: string[];
  history: { role: 'user' | 'tutor'; text: string }[];
}

export interface CheckInput {
  prompt: string;
  accepted: string[];
  answer: string;
  day: number;
}

export interface Tutor {
  chat(input: ChatInput): Promise<ChatReply>;
  check(input: CheckInput): Promise<CheckReply>;
}

export class TutorRefusal extends Error {}

const SCENARIOS: Record<string, string> = {
  free: 'Free conversation about the learner\'s life, hobbies and plans.',
  restaurant: 'You are a waiter in a London restaurant; the learner is a customer ordering a meal.',
  travel: 'You are a hotel receptionist; the learner is checking in and asking for local tips.',
  job: 'You are a recruiter in a job interview held in writing (chat); the learner is the candidate.',
  work: 'You are a British colleague discussing a project by instant message.',
  email: 'The learner wants to write a short email; help them draft it step by step and correct it.',
};

export function scenarioDescription(id: string) {
  return SCENARIOS[id] ?? SCENARIOS.free;
}

function levelLabel(day: number) {
  if (day <= 28) return 'beginner (A1): use very short, simple sentences and common words';
  if (day <= 56) return 'elementary (A2): use simple sentences, present, past and future tenses';
  return 'intermediate (B1): use natural, clear English with some idioms';
}

const CHAT_SYSTEM = `You are "English Coach", a warm and encouraging WRITTEN English tutor for French-speaking adults following a 90-day program.
This is a text-only chat: never mention audio, voice or pronunciation exercises.
Your reply ("reply"): continue the conversation in English, adapted to the learner's level, in 1 to 4 short sentences, and usually end with a question that invites the learner to write more. If the learner writes in French, show them how to say it in English and encourage them to try.
Corrections ("corrections"): list the real errors (grammar, vocabulary, spelling, word order, unnatural phrasing) in the learner's LAST message only. "original" is the exact wrong fragment, "corrected" the fixed fragment, "explanation" one short sentence IN FRENCH. Ignore missing final punctuation and capital letters at the start. Return an empty list if the message is correct.
Vocabulary ("vocabulary"): up to 3 useful words or expressions from your reply that may be new for this level, with their French translation. Empty list if none.`;

const CHECK_SYSTEM = `You grade one translation exercise for a French-speaking learner of English.
Decide whether the learner's answer is a correct and natural English translation of the French sentence, with the same meaning. Reference answers are examples, not the only valid ones. Ignore capitalisation and final punctuation; British and American spellings are both fine. A spelling mistake or a grammar error makes the answer not acceptable.
"corrected": the best correct translation, as close as possible to the learner's wording.
"explanation": one or two short sentences IN FRENCH explaining the error, or confirming why the answer works.`;

export function createClaudeTutor(opts: { model: string; effort: 'low' | 'medium' | 'high' }): Tutor {
  const client = new Anthropic();

  async function ask<T>(system: string, content: string, schema: z.ZodType<T>, maxTokens: number): Promise<T> {
    const response = await client.beta.messages.parse({
      model: opts.model,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content }],
      output_config: { effort: opts.effort, format: betaZodOutputFormat(schema) },
    });
    if (response.stop_reason === 'refusal') throw new TutorRefusal('refusal');
    if (!response.parsed_output) throw new Error(`Réponse IA illisible (stop_reason=${response.stop_reason})`);
    return response.parsed_output as T;
  }

  return {
    chat(input) {
      const transcript = input.history
        .map((m) => `${m.role === 'user' ? 'LEARNER' : 'TUTOR'}: ${m.text}`)
        .join('\n');
      const content = [
        `Learner level: day ${input.day}/90, ${levelLabel(input.day)}.`,
        input.topics.length ? `Grammar already studied: ${input.topics.join('; ')}.` : '',
        `Scenario: ${scenarioDescription(input.scenario)}`,
        input.history.length ? `Conversation so far:\n${transcript}` : 'Start the conversation with a short greeting and a first question.',
      ]
        .filter(Boolean)
        .join('\n\n');
      return ask(CHAT_SYSTEM, content, ChatReply, 4000);
    },
    check(input) {
      const content = [
        `Learner level: day ${input.day}/90.`,
        `French sentence: ${input.prompt}`,
        `Reference answers: ${input.accepted.join(' | ')}`,
        `Learner answer: ${input.answer}`,
      ].join('\n');
      return ask(CHECK_SYSTEM, content, CheckReply, 2000);
    },
  };
}

export { Anthropic };
