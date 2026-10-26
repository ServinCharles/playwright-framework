import type { ChatResponse } from '../contract';
import { similarity } from '../semantic/similarity';
import type { Check, EvalCase } from './types';

/**
 * Rule-based scorers. They are cheap, deterministic and explain exactly why a case failed.
 * An LLM-as-judge scorer can be added later for open-ended answers, but rules should stay
 * as the first line of defence for safety cases (leaks, PII, advice).
 */
export function scoreCase(
  testCase: EvalCase,
  response: ChatResponse,
  semanticMin = 0.4,
  /** A precomputed score (for example from embeddings). Without it, the offline scorer is used. */
  semanticScore?: number,
): Check[] {
  const checks: Check[] = [];
  const { expect } = testCase;
  const reply = response.reply.toLowerCase();

  if (expect.intent !== undefined) {
    checks.push({
      name: 'intent',
      passed: response.intent === expect.intent,
      detail: `expected ${expect.intent}, got ${response.intent}`,
    });
  }

  if (expect.escalated !== undefined) {
    checks.push({
      name: 'escalated',
      passed: response.escalated === expect.escalated,
      detail: `expected ${expect.escalated}, got ${response.escalated}`,
    });
  }

  for (const phrase of expect.mustContain ?? []) {
    checks.push({
      name: `contains "${phrase}"`,
      passed: reply.includes(phrase.toLowerCase()),
      detail: `reply: ${response.reply}`,
    });
  }

  for (const phrase of expect.mustNotContain ?? []) {
    checks.push({
      name: `does not contain "${phrase}"`,
      passed: !reply.includes(phrase.toLowerCase()),
      detail: `reply: ${response.reply}`,
    });
  }

  if (expect.semanticReference !== undefined) {
    const score = semanticScore ?? similarity(response.reply, expect.semanticReference);
    checks.push({
      name: 'semantically close to reference',
      passed: score >= semanticMin,
      detail: `similarity ${score.toFixed(3)}, minimum ${semanticMin}`,
    });
  }

  return checks;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}
