import { test, expect } from '@playwright/test';
import { similarity, stem, tokens } from '../../ai/semantic/similarity';
import { scoreCase } from '../../ai/eval/scorers';
import type { EvalCase } from '../../ai/eval/types';
import type { ChatResponse } from '../../ai/contract';

// Calibration pairs: same-meaning pairs must clear the threshold, unrelated pairs must not.
const SAME: [string, string][] = [
  ['You can reset your password from the login page', 'Reset your password from the login page'],
  [
    'Use the Forgotten password link on the login page to reset it',
    'Reset your password using the forgotten password link',
  ],
  [
    'We cannot share your account details with anyone',
    'Never share your account details with others',
  ],
  [
    'Your application reference is shown in the email we sent',
    'The application reference appears in your email',
  ],
];

const DIFFERENT: [string, string][] = [
  [
    'You can reset your password from the login page',
    'Your mortgage offer expires after six months',
  ],
  ['I cannot give personal financial advice', 'Here are the best savings accounts to open today'],
  ['Please call us to speak to an adviser', 'Forgotten password link on the login page'],
  ['We cannot share your account details', 'The weather in London is sunny today'],
];

test.describe('Offline similarity', () => {
  test('paraphrases score above the 0.4 threshold @smoke', () => {
    for (const [a, b] of SAME) expect(similarity(a, b)).toBeGreaterThanOrEqual(0.5);
  });

  test('unrelated texts score below the threshold @smoke', () => {
    for (const [a, b] of DIFFERENT) expect(similarity(a, b)).toBeLessThan(0.2);
  });

  test('identical text scores 1 and empty text scores 0', () => {
    expect(similarity('reset your password', 'reset your password')).toBeCloseTo(1, 5);
    expect(similarity('', 'reset your password')).toBe(0);
  });

  test('stemming makes plurals and verb forms count as the same word', () => {
    expect(stem('payments')).toBe('payment');
    expect(stem('policies')).toBe('policy');
    expect(stem('resetting')).toBe('reset');
    expect(stem('address')).toBe('address');
  });

  test('stopwords and punctuation are ignored', () => {
    expect(tokens('How do I reset my password?')).toEqual(['reset', 'password']);
  });

  test('known limitation: shared words with opposite meaning still score high', () => {
    // Bag-of-words cannot see negation. This is why safety cases stay rule-based and
    // semantic checks are reserved for reference answers. Pinned here so the limit is visible.
    const score = similarity(
      'You can reset your password from the login page',
      'You cannot reset your password from the login page',
    );
    expect(score).toBeGreaterThan(0.4);
  });
});

test.describe('semantic check in the scorer', () => {
  const testCase: EvalCase = {
    id: 'sem-1',
    category: 'functional',
    input: 'I forgot my password',
    expect: {
      semanticReference:
        'You can reset your password from the login page using the Forgotten password link.',
    },
  };

  const reply = (text: string): ChatResponse => ({
    reply: text,
    intent: 'password_reset',
    escalated: false,
    requestId: 'r',
  });

  test('a paraphrased answer passes the semantic check', () => {
    const checks = scoreCase(
      testCase,
      reply('Reset it from the login page with the Forgotten password link.'),
    );
    expect(checks.find((c) => c.name === 'semantically close to reference')?.passed).toBe(true);
  });

  test('an answer about something else fails the semantic check', () => {
    const checks = scoreCase(
      testCase,
      reply('Our savings accounts pay a competitive rate this month.'),
    );
    expect(checks.find((c) => c.name === 'semantically close to reference')?.passed).toBe(false);
  });

  test('the minimum can be raised per run', () => {
    const checks = scoreCase(
      testCase,
      reply('Reset it from the login page with the Forgotten password link.'),
      0.99,
    );
    expect(checks.find((c) => c.name === 'semantically close to reference')?.passed).toBe(false);
  });
});
