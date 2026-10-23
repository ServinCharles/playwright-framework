import { test, expect } from '@playwright/test';
import { isLostCardReport, LOST_CARD_REPLY } from '../../chat-service/lost-card';
import { createLlmAssistant } from '../../chat-service/llm-assistant';
import type { LlmClient } from '../../ai/llm/client';

// Positive cases come from requirements/lost-card.md (issue #21).
const POSITIVE = [
  'I lost my card',
  'my card was stolen',
  'someone took my debit card',
  'cant find my card anywhere',
  "can't find my card",
  'MY CARD HAS BEEN NICKED',
  '   I   lost   my card   ',
  'my card got stolen yesterday',
  'my card is missing',
  'Hi, sorry to bother you, I think I lost my card at the station',
];

// Messages that mention a card but are not a lost or stolen report.
const NEGATIVE = [
  'my card was declined',
  'how do I lose weight',
  'how do I change my card PIN',
  'I lost my password',
  'can I use my card abroad',
  'what is my card limit',
];

test.describe('Lost card fast path: matching', () => {
  test('lost or stolen reports trigger the fast path @critical', () => {
    for (const message of POSITIVE) {
      expect(isLostCardReport(message), `should match: "${message}"`).toBe(true);
    }
  });

  test('messages that only look similar do not trigger it @smoke', () => {
    for (const message of NEGATIVE) {
      expect(isLostCardReport(message), `should not match: "${message}"`).toBe(false);
    }
  });

  test('known misspellings still trigger the fast path @critical', () => {
    expect(isLostCardReport('my crad was stollen')).toBe(true);
    expect(isLostCardReport('i lsot my card')).toBe(true);
  });

  test('empty or blank input does not trigger it @smoke', () => {
    expect(isLostCardReport('')).toBe(false);
    expect(isLostCardReport('   ')).toBe(false);
  });

  test('a lost card report never reaches the model @critical', async () => {
    let calls = 0;
    const llm = {
      name: 'call-counter',
      async complete() {
        calls++;
        return { text: '{}', model: 'counter', latencyMs: 1 };
      },
    } as unknown as LlmClient;

    const result = await createLlmAssistant(llm)('I think I lost my card');

    expect(calls).toBe(0);
    expect(result.reply).toBe(LOST_CARD_REPLY);
    expect(result.intent).toBe('human_handoff');
    expect(result.escalated).toBe(true);
  });
});
