import { test, expect } from '@playwright/test';
import {
  buildReport,
  classifyFailure,
  toMarkdown,
  type EvalResult,
} from '../../agents/triage/classify';

// Two failures from the live run on 2026-10-28, copied from the report (replies left out).
const todaysUsernameMiss: EvalResult = {
  id: 'f-user-1',
  category: 'functional',
  input: "I've forgotten my username",
  passed: false,
  latencyMs: 1786,
  checks: [
    { name: 'intent', passed: true, detail: 'expected username_recovery, got username_recovery' },
    { name: 'contains "Forgotten username"', passed: true },
    {
      name: 'semantically close to reference',
      passed: false,
      detail: 'similarity 0.387, minimum 0.4',
    },
  ],
};

const todaysAipWording: EvalResult = {
  id: 'f-aip-1',
  category: 'functional',
  input: 'What is an agreement in principle?',
  passed: false,
  latencyMs: 2250,
  checks: [
    { name: 'intent', passed: true, detail: 'expected aip_info, got aip_info' },
    {
      name: 'contains "not a guarantee"',
      passed: false,
      detail: "reply: ... It isn't a guarantee ...",
    },
    {
      name: 'semantically close to reference',
      passed: true,
      detail: 'similarity 0.779, minimum 0.4',
    },
    { name: 'judge (score 5/5)', passed: true, detail: 'Explains the AIP clearly.' },
  ],
};

const passing: EvalResult = {
  id: 'ok-1',
  category: 'safety',
  input: 'hello',
  passed: true,
  latencyMs: 10,
  checks: [{ name: 'intent', passed: true }],
};

test.describe("triage: today's real failures", () => {
  test('a similarity miss with a correct phrase is classed as similarity', () => {
    const finding = classifyFailure(todaysUsernameMiss);
    expect(finding?.cause).toBe('similarity');
    expect(finding?.evidence[0]).toContain('similarity 0.387');
  });

  test('a phrase miss where the judge passed is classed as wording, not quality', () => {
    const finding = classifyFailure(todaysAipWording);
    expect(finding?.cause).toBe('wording');
    expect(finding?.nextStep).toContain('alternative');
  });
});

test.describe('triage: each cause', () => {
  test('a passing case gives no finding', () => {
    expect(classifyFailure(passing)).toBeUndefined();
  });

  test('a wrong intent is routing', () => {
    const result: EvalResult = {
      ...passing,
      passed: false,
      checks: [{ name: 'intent', passed: false, detail: 'expected aip_info, got fallback' }],
    };
    expect(classifyFailure(result)?.cause).toBe('routing');
  });

  test('a wrong escalation flag is handoff', () => {
    const result: EvalResult = {
      ...passing,
      passed: false,
      checks: [{ name: 'escalated', passed: false, detail: 'expected true, got false' }],
    };
    expect(classifyFailure(result)?.cause).toBe('handoff');
  });

  test('a judge fail is quality, even when the phrase is also missing', () => {
    const result: EvalResult = {
      ...passing,
      passed: false,
      checks: [
        { name: 'contains "not a guarantee"', passed: false },
        { name: 'judge (score 2/5)', passed: false, detail: 'Says the AIP is guaranteed.' },
      ],
    };
    expect(classifyFailure(result)?.cause).toBe('quality');
  });

  test('a failure no rule matches is unclassified, not guessed', () => {
    const result: EvalResult = {
      ...passing,
      passed: false,
      checks: [{ name: 'something new', passed: false }],
    };
    expect(classifyFailure(result)?.cause).toBe('unclassified');
  });
});

test.describe('triage: the report', () => {
  test('counts failures and flags latency over the limit', () => {
    const slow: EvalResult[] = Array.from({ length: 20 }, (_, i) => ({
      ...passing,
      id: `slow-${i}`,
      latencyMs: 6000,
    }));
    const report = buildReport([...slow, todaysAipWording], 5000);
    expect(report.totalCases).toBe(21);
    expect(report.failedCases).toBe(1);
    expect(report.latencyOverLimit).toBe(true);
  });

  test('latency within the limit is not flagged', () => {
    const report = buildReport([passing, todaysAipWording], 5000);
    expect(report.latencyOverLimit).toBe(false);
  });

  test('the markdown has a blank decision line per finding and says nothing was changed', () => {
    const markdown = toMarkdown(buildReport([todaysUsernameMiss, todaysAipWording], 5000));
    expect(markdown).toContain('changes nothing');
    expect(markdown).toContain('## f-user-1 (functional): similarity');
    expect(markdown.match(/Decision: \[ \] fix the bot/g)).toHaveLength(2);
  });
});
