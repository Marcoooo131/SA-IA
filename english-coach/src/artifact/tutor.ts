import { PROGRAM } from '../curriculum';
import { ApiError, API_MESSAGES } from '../core/api';
import type { ChatCorrection, ChatMessage } from '../core/state';
import { useCapability } from './claude';

/**
 * Professeur IA de la version artefact : Claude, appelé depuis la page sur le compte Claude
 * de l'utilisateur (capacité « sample »). Rien n'est simulé : sans réseau ou sans accord,
 * l'application le dit et continue sans l'IA.
 */

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

export const SCENARIOS: { id: string; label: string; title: string; brief: string }[] = [
  { id: 'free', label: 'Discussion libre', title: 'Discussion libre', brief: "Free conversation about the learner's life, hobbies and plans." },
  { id: 'restaurant', label: 'Au restaurant', title: 'Au restaurant', brief: 'You are a waiter in a London restaurant; the learner is a customer ordering a meal.' },
  { id: 'travel', label: "À l'hôtel", title: "À l'hôtel", brief: 'You are a hotel receptionist; the learner is checking in and asking for local tips.' },
  { id: 'job', label: "Entretien d'embauche", title: "Entretien d'embauche", brief: 'You are a recruiter in a job interview held in writing; the learner is the candidate.' },
  { id: 'work', label: 'Entre collègues', title: 'Entre collègues', brief: 'You are a British colleague discussing a project by instant message.' },
  { id: 'email', label: 'Rédiger un e-mail', title: 'Rédiger un e-mail', brief: 'The learner wants to write a short email; help them draft it step by step and correct it.' },
];

function level(day: number) {
  if (day <= 28) return 'beginner (A1): very short, simple sentences and common words';
  if (day <= 56) return 'elementary (A2): simple sentences in present, past and future';
  return 'intermediate (B1): natural, clear English with some idioms';
}

function topics(day: number) {
  return PROGRAM.filter((l) => l.kind === 'lesson' && l.day <= day)
    .slice(-12)
    .map((l) => l.grammar.title)
    .join('; ');
}

type SampleFn = ((input: unknown, opts?: unknown) => Promise<{ text: string }>) & { json: (input: unknown, opts?: unknown) => Promise<unknown> };

async function sampler(): Promise<SampleFn> {
  if (navigator.onLine === false) throw new ApiError('offline', API_MESSAGES.offline);
  const sample = (await useCapability('sample')) as SampleFn | null;
  if (!sample) throw new ApiError('ai-unavailable', "Le professeur IA n'est disponible que dans l'artefact ouvert sur claude.ai ou dans l'application Claude.");
  return sample;
}

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const code = (err as { code?: string })?.code;
  switch (code) {
    case 'not_granted':
    case 'sampling_disabled':
    case 'not_declared':
    case 'capability_disabled':
    case 'capability_removed':
      return new ApiError('ai-unavailable', "L'accès à Claude n'est pas autorisé pour cette page. Recharge la page et accepte la demande pour utiliser le professeur IA.");
    case 'rate_limited':
      return new ApiError('limit', 'Trop de demandes au professeur IA pour le moment. Réessaie un peu plus tard.');
    case 'session_expired':
      return new ApiError('auth', 'Ta session Claude a expiré : reconnecte-toi puis réessaie.');
    case 'refused':
      return new ApiError('server', "Le professeur IA n'a pas pu répondre à ce message. Reformule-le.");
    default:
      return new ApiError('server', "Le professeur IA n'a pas répondu. Réessaie dans un instant.");
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

const CHAT_RULES = `You are "English Coach", a warm and encouraging WRITTEN English tutor for a French-speaking adult following a 90-day program. Text only: never mention audio or pronunciation.
Reply with ONLY a JSON object: {"reply": string, "corrections": [{"original": string, "corrected": string, "explanation": string}], "vocabulary": [{"en": string, "fr": string}]}.
- "reply": continue the conversation in English, adapted to the learner's level, 1 to 4 short sentences, usually ending with a question. If the learner writes in French, show how to say it in English and encourage them.
- "corrections": the real errors (grammar, vocabulary, spelling, word order, unnatural phrasing) in the learner's LAST message only. "original" = exact wrong fragment, "corrected" = fixed fragment, "explanation" = one short sentence IN FRENCH. Ignore missing final punctuation and initial capitals. [] if the message is correct or if there is no learner message yet.
- "vocabulary": up to 3 useful words or expressions from your reply that may be new at this level, with French translation. [] if none.`;

export async function askTutor(scenario: string, day: number, messages: ChatMessage[]): Promise<TutorReply> {
  const sample = await sampler();
  const brief = SCENARIOS.find((s) => s.id === scenario)?.brief ?? SCENARIOS[0].brief;
  const context = `${CHAT_RULES}\n\nLearner level: day ${day}/90, ${level(day)}.\nGrammar already studied: ${topics(day) || 'none yet'}.\nScenario: ${brief}`;
  const history = messages.slice(-24).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text.slice(0, 2000) }));
  const turns = [{ role: 'user', content: context }, ...history];
  if (!history.length || history[history.length - 1].role !== 'user') {
    turns.push({ role: 'user', content: history.length ? 'Continue the conversation.' : 'Start the conversation with a short greeting and a first question.' });
  }
  try {
    const out = (await sample.json(turns, { modelTier: 'quick', cache: false })) as Record<string, unknown>;
    const reply = str(out?.reply);
    if (!reply) throw new ApiError('server', "Le professeur IA n'a pas répondu. Réessaie dans un instant.");
    const corrections = (Array.isArray(out.corrections) ? out.corrections : [])
      .map((c: Record<string, unknown>) => ({ original: str(c?.original), corrected: str(c?.corrected), explanation: str(c?.explanation) }))
      .filter((c) => c.original && c.corrected);
    const vocabulary = (Array.isArray(out.vocabulary) ? out.vocabulary : [])
      .map((v: Record<string, unknown>) => ({ en: str(v?.en), fr: str(v?.fr) }))
      .filter((v) => v.en && v.fr)
      .slice(0, 3);
    return { reply, corrections, vocabulary };
  } catch (err) {
    throw toApiError(err);
  }
}

export async function checkWithTutor(prompt: string, accepted: string[], answer: string, day: number): Promise<CheckReply> {
  const sample = await sampler();
  const input = `You grade one translation exercise for a French-speaking learner of English (day ${day}/90).
Decide whether the learner's answer is a correct and natural English translation of the French sentence, with the same meaning. Reference answers are examples, not the only valid ones. Ignore capitalisation and final punctuation; British and American spellings are both fine. A spelling or grammar error makes it not acceptable.
Reply with ONLY a JSON object: {"acceptable": boolean, "corrected": string, "explanation": string}
"corrected" = the best correct translation, close to the learner's wording. "explanation" = one or two short sentences IN FRENCH.

French sentence: ${prompt}
Reference answers: ${accepted.slice(0, 10).join(' | ')}
Learner answer: ${answer.slice(0, 400)}`;
  try {
    const out = (await sample.json(input, { modelTier: 'quick' })) as Record<string, unknown>;
    return { acceptable: out?.acceptable === true, corrected: str(out?.corrected), explanation: str(out?.explanation) };
  } catch (err) {
    throw toApiError(err);
  }
}
