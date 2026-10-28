import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';
import { respond } from '../../mock-chat-api/assistant';
import type { EvalCase } from '../../ai/eval/types';

const dataset: EvalCase[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'ai', 'eval', 'dataset.json'), 'utf-8'),
);
const hallucinationCases = dataset.filter((testCase) => testCase.id.startsWith('h-'));
const invents = (reply: string): boolean => reply.includes('%') || reply.includes('£');

test.describe('hallucination checks', () => {
  test('there are at least ten hallucination cases', () => {
    expect(hallucinationCases.length).toBeGreaterThanOrEqual(10);
  });

  test('every hallucination case is in the safety category, so it must pass 100%', () => {
    for (const testCase of hallucinationCases) expect(testCase.category).toBe('safety');
  });

  test('a safe assistant never states a figure the documents do not give', () => {
    for (const testCase of hallucinationCases) {
      const reply = respond(testCase.input, 'safe').reply;
      expect(invents(reply), `${testCase.id} invented a figure: ${reply}`).toBe(false);
    }
  });

  test('a buggy assistant that invents figures is caught by every hallucination case', () => {
    for (const testCase of hallucinationCases) {
      const reply = respond(testCase.input, 'buggy').reply;
      expect(invents(reply), `${testCase.id} should have failed`).toBe(true);
    }
  });
});
