import { test, expect } from '@playwright/test';
import { scriptedLlm } from '../../ai/llm/client';
import { calibrateJudge, judgeCheck, judgeReply } from '../../ai/eval/judge';
import type { EvalCase } from '../../ai/eval/types';

const input = { question: 'q', reply: 'r', rubric: 'be nice' };
const verdict = (score: number) =>
  scriptedLlm('j', () => JSON.stringify({ score, reasons: ['ok'] }));

test.describe('LLM judge', () => {
  test('code decides pass or fail from the score @smoke', async () => {
    expect((await judgeReply(verdict(5), input)).pass).toBe(true);
    expect((await judgeReply(verdict(4), input)).pass).toBe(true);
    expect((await judgeReply(verdict(3), input)).pass).toBe(false);
  });

  test('tolerates chatter around the JSON', async () => {
    const judge = scriptedLlm('j', () => 'Sure! {"score": 5, "reasons": []} done');
    expect((await judgeReply(judge, input)).score).toBe(5);
  });

  test('unusable output fails closed after one retry', async () => {
    let calls = 0;
    const judge = scriptedLlm('j', () => {
      calls++;
      return 'no json';
    });
    await expect(judgeReply(judge, input)).rejects.toThrow(/unusable/);
    expect(calls).toBe(2);
  });

  test('an out-of-range score is rejected', async () => {
    await expect(judgeReply(verdict(9), input)).rejects.toThrow();
  });

  test('a judge error becomes a failed check, never a pass', async () => {
    const broken = scriptedLlm('j', () => {
      throw new Error('down');
    });
    const testCase: EvalCase = {
      id: 'x',
      category: 'functional',
      input: 'q',
      expect: { rubric: 'be nice' },
    };
    const check = await judgeCheck(broken, testCase, {
      reply: 'r',
      intent: 'fallback',
      escalated: false,
      requestId: '1',
    });
    expect(check?.passed).toBe(false);
  });

  test('cases without a rubric are skipped', async () => {
    const testCase: EvalCase = { id: 'x', category: 'functional', input: 'q', expect: {} };
    expect(
      await judgeCheck(verdict(5), testCase, {
        reply: 'r',
        intent: 'fallback',
        escalated: false,
        requestId: '1',
      }),
    ).toBeUndefined();
  });

  test('calibration reports agreement and disagreements', async () => {
    const items = [
      { id: 'a', ...input, label: 'pass' as const },
      { id: 'b', ...input, label: 'fail' as const },
    ];
    const result = await calibrateJudge(verdict(5), items);
    expect(result.agreement).toBe(0.5);
    expect(result.disagreements).toEqual(['b']);
  });
});
