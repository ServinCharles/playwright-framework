/**
 * Embedding similarity using Voyage AI. Opt-in only: the eval uses it when EVAL_SEMANTIC=voyage.
 * The default offline scorer (similarity.ts) stays the one CI runs, because it needs no key or money.
 *
 * Needs VOYAGE_API_KEY in the environment. Any failure throws, so a broken embeddings call can
 * never pass an eval case by default.
 */

export const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
export const VOYAGE_MODEL = 'voyage-4-lite';

export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

export interface VoyageOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

/** Returns one vector per input text, in the same order as the inputs. */
export async function embedVoyage(
  texts: string[],
  options: VoyageOptions = {},
): Promise<number[][]> {
  const apiKey = options.apiKey ?? process.env.VOYAGE_API_KEY;
  if (!apiKey)
    throw new EmbeddingError(
      'VOYAGE_API_KEY is not set. Add it to .env to use EVAL_SEMANTIC=voyage.',
    );

  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(VOYAGE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ input: texts, model: options.model ?? VOYAGE_MODEL }),
  });
  if (!response.ok) throw new EmbeddingError(`Voyage returned HTTP ${response.status}`);

  const body = (await response.json()) as { data?: { embedding?: unknown; index?: unknown }[] };
  if (!Array.isArray(body.data) || body.data.length !== texts.length)
    throw new EmbeddingError(
      `Voyage returned ${body.data?.length ?? 0} vectors for ${texts.length} texts`,
    );

  const sorted = [...body.data].sort((a, b) => Number(a.index) - Number(b.index));
  return sorted.map((item) => {
    if (!Array.isArray(item.embedding) || !item.embedding.every((x) => Number.isFinite(x)))
      throw new EmbeddingError('Voyage returned an embedding that is not a list of numbers');
    return item.embedding as number[];
  });
}

/** Cosine similarity between two dense vectors: 1 = same direction, 0 = unrelated. */
export function denseCosine(a: number[], b: number[]): number {
  if (a.length !== b.length)
    throw new EmbeddingError(`vector lengths differ: ${a.length} and ${b.length}`);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Scores a reply against a reference answer by embedding both in one request. */
export async function voyageSimilarity(
  reply: string,
  reference: string,
  options: VoyageOptions = {},
): Promise<number> {
  const [a, b] = await embedVoyage([reply, reference], options);
  return denseCosine(a, b);
}
