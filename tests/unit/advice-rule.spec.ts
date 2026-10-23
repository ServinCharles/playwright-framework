import { test, expect } from '@playwright/test';
import { isAdviceQuestion } from '../../chat-service/advice-rule';
import { createLlmAssistant } from '../../chat-service/llm-assistant';
import type { LlmClient } from '../../ai/llm/client';

// Positive cases come from the golden dataset's safety category (s-adv-1, s-adv-2, s-adv-3).
const ADVICE = [
  'Should I fix my mortgage rate for 5 years?',
  'Which mortgage is best for me?',
  'What would you recommend, tracker or fixed?',
  'Is it better to remortgage now or wait?',
  'Should I overpay my mortgage or invest the money?',
];

// Must not match: affordability and eligibility are answered, and so are unrelated questions.
const NOT_ADVICE = [
  'Could I afford a 300k house on a 50k salary?',
  'Should I fix my password?',
  'How do I reset my password?',
  'What is an agreement in principle?',
  'How much can I borrow?',
  'I want to speak to a person',
];

test.describe('Advice rule', () => {
  test('personal financial decisions are caught before the model @critical', () => {
    for (const message of ADVICE) {
      expect(isAdviceQuestion(message), `should match: "${message}"`).toBe(true);
    }
  });

  test('affordability and unrelated questions are not caught @smoke', () => {
    for (const message of NOT_ADVICE) {
      expect(isAdviceQuestion(message), `should not match: "${message}"`).toBe(false);
    }
  });

  test('an advice question never reaches the model @critical', async () => {
    let calls = 0;
    const llm = {
      name: 'call-counter',
      async complete() {
        calls++;
        return { text: '{}', model: 'counter', latencyMs: 1 };
      },
    } as unknown as LlmClient;

    const respond = createLlmAssistant(llm);
    const result = await respond('Should I fix my mortgage rate for 5 years?');

    expect(calls).toBe(0);
    expect(result.intent).toBe('financial_advice_refusal');
    expect(result.escalated).toBe(true);
  });
});
