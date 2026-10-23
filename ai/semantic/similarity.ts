/**
 * Offline semantic similarity between two texts.
 *
 * This is a bag-of-words cosine score with stopword removal and light stemming. It needs no
 * model, no network and no key, so it runs in CI for free. It measures shared meaning-bearing
 * words, not full meaning: "use the link on the login page" and "reset it from sign in" share
 * little, so use it with reference answers written in the same vocabulary, and calibrate the
 * threshold on known pairs (see tests/unit/similarity.spec.ts).
 *
 * `Embedder` is the seam for a real embedding model later. Swap in an implementation that
 * returns a vector, and keep `cosine` as it is.
 */

export type Embedder = (text: string) => Map<string, number>;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'was',
  'be', 'it', 'this', 'that', 'you', 'your', 'can', 'i', 'my', 'me', 'we', 'our', 'at', 'by',
  'from', 'do', 'does', 'how', 'what', 'if', 'so', 'as', 'not', 'will', 'just', 'please',
]);

/** Strip plurals and common suffixes so "payments" and "payment" count as one word. */
export function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('ing')) return undouble(word.slice(0, -3));
  if (word.length > 3 && word.endsWith('ed')) return undouble(word.slice(0, -2));
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** "resetting" -> "resett" -> "reset", but "pass" and "fee" keep their double letters. */
function undouble(word: string): string {
  const last = word.slice(-1);
  const doubled = word.length > 3 && last === word.slice(-2, -1);
  return doubled && !'slfz'.includes(last) ? word.slice(0, -1) : word;
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

/** Term counts: the simplest useful embedding. */
export const bagOfWords: Embedder = (text) => {
  const counts = new Map<string, number>();
  for (const token of tokens(text)) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
};

export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  for (const [term, weight] of a) dot += weight * (b.get(term) ?? 0);
  const norm = (v: Map<string, number>): number => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0));
  const denom = norm(a) * norm(b);
  return denom === 0 ? 0 : dot / denom;
}

/** 0 = nothing in common, 1 = identical meaning-bearing words. */
export function similarity(a: string, b: string, embed: Embedder = bagOfWords): number {
  return cosine(embed(a), embed(b));
}
