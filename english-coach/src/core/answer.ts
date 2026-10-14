/**
 * Correction locale des réponses écrites : tolérante aux majuscules, à la ponctuation,
 * aux contractions (I'm = I am) et aux petites fautes de frappe.
 */

export type Verdict = 'correct' | 'typo' | 'wrong';

export interface CheckResult {
  verdict: Verdict;
  /** Réponse de référence la plus proche de celle de l'utilisateur. */
  closest: string;
}

const NOT_CONTRACTIONS: Record<string, string> = {
  "can't": 'can not',
  cannot: 'can not',
  "won't": 'will not',
  "shan't": 'shall not',
  "ain't": 'is not',
};
const S_SUBJECTS = new Set(['he', 'she', 'it', 'that', 'what', 'where', 'there', 'here', 'who', 'how', 'when', 'why', 'everything', 'nobody', 'everyone', 'this']);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”«»"]/g, ' ')
    .replace(/[.,!?;:()…]/g, ' ')
    .replace(/(^|\s)'+|'+(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Toutes les formes développées d'un mot (« he's » → « he is » / « he has »). */
function expandToken(token: string): string[] {
  if (NOT_CONTRACTIONS[token]) return [NOT_CONTRACTIONS[token]];
  if (token === "let's") return ['let us'];
  if (token.endsWith("n't")) return [`${token.slice(0, -3)} not`];
  const m = token.match(/^(.+)'(m|re|ll|ve|d|s)$/);
  if (!m) return [token];
  const [, base, suffix] = m;
  switch (suffix) {
    case 'm':
      return [`${base} am`];
    case 're':
      return [`${base} are`];
    case 'll':
      return [`${base} will`];
    case 've':
      return [`${base} have`];
    case 'd':
      return [`${base} would`, `${base} had`];
    default:
      return S_SUBJECTS.has(base) ? [`${base} is`, `${base} has`] : [token];
  }
}

/** Variantes développées d'une phrase normalisée (bornées pour rester rapides). */
export function variants(text: string, wordMode = false): string[] {
  let tokens = normalize(text).split(' ').filter(Boolean);
  if (wordMode) {
    // « to work » = « work », « a dog » = « dog »
    while (tokens.length > 1 && ['to', 'a', 'an', 'the'].includes(tokens[0])) tokens = tokens.slice(1);
  }
  let out = [''];
  for (const token of tokens) {
    const options = expandToken(token);
    const next: string[] = [];
    for (const prefix of out) for (const opt of options) next.push(prefix ? `${prefix} ${opt}` : opt);
    out = next.slice(0, 32);
  }
  return out;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function checkAnswer(answer: string, accepted: string[], opts: { wordMode?: boolean } = {}): CheckResult {
  const fallback = accepted[0] ?? '';
  const mine = variants(answer, opts.wordMode);
  if (!mine.length || !mine[0]) return { verdict: 'wrong', closest: fallback };

  let best = { distance: Infinity, closest: fallback, length: 1 };
  for (const ref of accepted) {
    const refs = variants(ref, opts.wordMode);
    for (const r of refs) {
      for (const m of mine) {
        if (r === m) return { verdict: 'correct', closest: ref };
        const distance = levenshtein(r, m);
        if (distance < best.distance) best = { distance, closest: ref, length: r.length };
      }
    }
  }
  // Une faute de frappe tous les 12 caractères environ, jamais sur les mots très courts.
  const tolerance = best.length < 4 ? 0 : Math.max(1, Math.floor(best.length / 12));
  if (best.distance <= tolerance) return { verdict: 'typo', closest: best.closest };
  return { verdict: 'wrong', closest: best.closest };
}
