import { test, expect } from '@playwright/test';
import {
  EmbeddingError,
  denseCosine,
  embedVoyage,
  VOYAGE_MODEL,
  VOYAGE_URL,
} from '../../ai/semantic/voyage';
import { semanticScorerFromEnv } from '../../ai/eval/runner';
import { scoreCase } from '../../ai/eval/scorers';
import type { EvalCase } from '../../ai/eval/types';

/** A fetch stub that records the request and returns the given body. */
function stubFetch(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

test.describe('Voyage embeddings client', () => {
  test('posts the texts with a bearer key and returns vectors in input order @critical', async () => {
    const { fetchImpl, calls } = stubFetch({
      data: [
        { index: 1, embedding: [0, 1] },
        { index: 0, embedding: [1, 0] },
      ],
    });
    const vectors = await embedVoyage(['first', 'second'], { apiKey: 'test-key', fetchImpl });

    expect(vectors).toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(calls[0].url).toBe(VOYAGE_URL);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer test-key');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      input: ['first', 'second'],
      model: VOYAGE_MODEL,
    });
  });

  test('a missing key fails with a clear message and makes no request @critical', async () => {
    const { fetchImpl, calls } = stubFetch({ data: [] });
    const previous = process.env.VOYAGE_API_KEY;
    // An empty value counts as missing, and it is restored after the test
    process.env.VOYAGE_API_KEY = '';
    await expect(embedVoyage(['x'], { fetchImpl })).rejects.toThrow(/VOYAGE_API_KEY is not set/);
    process.env.VOYAGE_API_KEY = previous ?? '';
    expect(calls).toHaveLength(0);
  });

  test('an HTTP error throws, so the case cannot pass by default @critical', async () => {
    const { fetchImpl } = stubFetch({ error: 'unauthorised' }, 401);
    await expect(embedVoyage(['x'], { apiKey: 'k', fetchImpl })).rejects.toThrow(/HTTP 401/);
  });

  test('a response with the wrong number of vectors throws', async () => {
    const { fetchImpl } = stubFetch({ data: [{ index: 0, embedding: [1] }] });
    await expect(embedVoyage(['a', 'b'], { apiKey: 'k', fetchImpl })).rejects.toBeInstanceOf(
      EmbeddingError,
    );
  });

  test('a vector that is not a list of numbers throws', async () => {
    const { fetchImpl } = stubFetch({ data: [{ index: 0, embedding: ['nope'] }] });
    await expect(embedVoyage(['a'], { apiKey: 'k', fetchImpl })).rejects.toThrow(
      /not a list of numbers/,
    );
  });
});

test.describe('Dense cosine similarity', () => {
  test('identical vectors score 1 and orthogonal vectors score 0', () => {
    expect(denseCosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
    expect(denseCosine([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  test('vectors of different lengths are rejected', () => {
    expect(() => denseCosine([1, 2], [1])).toThrow(/lengths differ/);
  });
});

test.describe('Semantic mode selection', () => {
  test('unset or offline keeps the offline scorer', () => {
    expect(semanticScorerFromEnv(undefined)).toBeUndefined();
    expect(semanticScorerFromEnv('offline')).toBeUndefined();
  });

  test('voyage selects the embeddings scorer', () => {
    expect(semanticScorerFromEnv('voyage')).toBeDefined();
  });

  test('an unknown value fails loudly rather than falling back silently', () => {
    expect(() => semanticScorerFromEnv('embeddings-please')).toThrow(
      /must be "offline" or "voyage"/,
    );
  });
});

test.describe('Scorer uses a precomputed score when given one @critical', () => {
  const testCase: EvalCase = {
    id: 'sem-embed',
    category: 'functional',
    input: 'I forgot my password',
    expect: { semanticReference: 'Reset it from the login page.' },
  };
  const response = {
    reply: 'Our savings accounts pay a competitive rate.',
    intent: 'password_reset' as const,
    escalated: false,
    requestId: 'r',
  };

  test('the supplied score decides the check, not the word overlap', () => {
    const checks = scoreCase(testCase, response, 0.4, 0.82);
    const semantic = checks.find((c) => c.name === 'semantically close to reference');
    expect(semantic?.passed).toBe(true);
  });

  test('without a supplied score the offline check still runs', () => {
    const checks = scoreCase(testCase, response, 0.4);
    expect(checks.find((c) => c.name === 'semantically close to reference')?.passed).toBe(false);
  });
});
