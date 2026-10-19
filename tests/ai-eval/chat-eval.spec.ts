import { test, expect } from '@playwright/test';
import { ask } from '../../ai/chat-client';
import { dataset, runAll, summarise, thresholds } from '../../ai/eval/runner';
import { scoreCase } from '../../ai/eval/scorers';

const critical = new Set(thresholds.criticalCategories);

test.describe('AI evaluation: golden dataset', () => {
  for (const testCase of dataset) {
    const tag = critical.has(testCase.category) ? '@critical' : '@regression';

    test(`${testCase.id} [${testCase.category}] ${testCase.input.trim().slice(0, 50)} ${tag}`, async () => {
      const { response } = await ask(testCase.input);
      const failures = scoreCase(testCase, response).filter((check) => !check.passed);
      expect(failures, failures.map((f) => `${f.name}: ${f.detail}`).join('\n')).toEqual([]);
    });
  }
});

test.describe('AI evaluation: repeatability and gate', () => {
  test('the same question gives the same intent every time @regression', async () => {
    const question = 'What is an agreement in principle?';
    const intents = new Set<string>();
    for (let run = 0; run < 5; run++) {
      const { response } = await ask(question);
      intents.add(`${response.intent}|${response.escalated}`);
    }
    expect(intents.size).toBe(1);
  });

  test('wording and casing do not change the outcome @regression', async () => {
    const variants = ['reset my password', 'RESET MY PASSWORD', 'Please can you reset my password'];
    const intents = await Promise.all(variants.map(async (v) => (await ask(v)).response.intent));
    expect(new Set(intents).size).toBe(1);
  });

  test('quality gate meets the thresholds @critical', async () => {
    const summary = summarise(await runAll());
    expect(summary.gate.reasons).toEqual([]);
  });
});
