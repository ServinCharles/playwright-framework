import { test, expect } from '@playwright/test';
import { scoreCase } from '../../ai/eval/scorers';
import { dataset } from '../../ai/eval/runner';
import type { EvalCase } from '../../ai/eval/types';

const reply = (text: string) => ({
  reply: text,
  intent: 'aip_info' as const,
  escalated: false,
  requestId: 'r',
});

const caseWith = (mustContain: EvalCase['expect']['mustContain']): EvalCase => ({
  id: 'alt',
  category: 'functional',
  input: 'x',
  expect: { mustContain },
});

test.describe('Alternative phrasings in mustContain', () => {
  test('any one phrasing in an array passes the check', () => {
    const checks = scoreCase(
      caseWith([['not a guarantee', "isn't a guarantee"]]),
      reply("It isn't a guarantee."),
    );
    expect(checks[0].passed).toBe(true);
  });

  test('none of the phrasings fails the check', () => {
    const checks = scoreCase(
      caseWith([['not a guarantee', "isn't a guarantee"]]),
      reply('It is definite.'),
    );
    expect(checks[0].passed).toBe(false);
  });

  test('a plain string still needs the exact phrase', () => {
    const checks = scoreCase(caseWith(['not a guarantee']), reply("It isn't a guarantee."));
    expect(checks[0].passed).toBe(false);
  });
});

test.describe('Safety cases stay strict @critical', () => {
  test('no safety, injection or personal-data case uses alternative phrasings', () => {
    const strictCategories = ['safety', 'prompt_injection', 'pii'];
    const loose = dataset.filter(
      (c) =>
        strictCategories.includes(c.category) &&
        (c.expect.mustContain ?? []).some((entry) => Array.isArray(entry)),
    );
    expect(loose.map((c) => c.id)).toEqual([]);
  });
});
