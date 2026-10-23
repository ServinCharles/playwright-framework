import fs from 'fs';
import path from 'path';
import { ask } from '../chat-client';
import { env } from '../../utils/env';
import type { LlmClient } from '../llm/client';
import { judgeCheck } from './judge';
import { percentile, scoreCase } from './scorers';
import type { CaseResult, EvalCase, Thresholds } from './types';

export const dataset: EvalCase[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'dataset.json'), 'utf-8'),
);
export const thresholds: Thresholds = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'thresholds.json'), 'utf-8'),
);

export async function runCase(
  testCase: EvalCase,
  baseUrl = env.chatApiUrl,
  judge?: LlmClient,
): Promise<CaseResult> {
  const { response, latencyMs } = await ask(testCase.input, baseUrl);
  const checks = scoreCase(testCase, response, thresholds.semanticSimilarityMin);
  if (judge) {
    const check = await judgeCheck(judge, testCase, response);
    if (check) checks.push(check);
  }
  return {
    id: testCase.id,
    category: testCase.category,
    input: testCase.input,
    reply: response.reply,
    intent: response.intent,
    passed: checks.every((c) => c.passed),
    latencyMs,
    checks,
  };
}

export async function runAll(baseUrl = env.chatApiUrl, judge?: LlmClient): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const testCase of dataset) results.push(await runCase(testCase, baseUrl, judge));
  return results;
}

export interface CategoryStat {
  category: string;
  passed: number;
  total: number;
  passRate: number;
}

export interface Summary {
  total: number;
  passed: number;
  passRate: number;
  p95LatencyMs: number;
  categories: CategoryStat[];
  gate: { passed: boolean; reasons: string[] };
}

export function summarise(results: CaseResult[], limits: Thresholds = thresholds): Summary {
  const passed = results.filter((r) => r.passed).length;
  const passRate = results.length === 0 ? 0 : passed / results.length;
  const p95LatencyMs = percentile(
    results.map((r) => r.latencyMs),
    95,
  );

  const names = [...new Set(results.map((r) => r.category))];
  const categories = names.map((category) => {
    const inCategory = results.filter((r) => r.category === category);
    const ok = inCategory.filter((r) => r.passed).length;
    return { category, passed: ok, total: inCategory.length, passRate: ok / inCategory.length };
  });

  const reasons: string[] = [];
  if (passRate < limits.overallPassRate) {
    reasons.push(`overall pass rate ${pct(passRate)} is below ${pct(limits.overallPassRate)}`);
  }
  for (const stat of categories) {
    if (
      limits.criticalCategories.includes(stat.category) &&
      stat.passRate < limits.criticalPassRate
    ) {
      reasons.push(
        `critical category "${stat.category}" is at ${pct(stat.passRate)}, needs ${pct(limits.criticalPassRate)}`,
      );
    }
  }
  if (p95LatencyMs > limits.p95LatencyMs) {
    reasons.push(`p95 latency ${Math.round(p95LatencyMs)}ms is above ${limits.p95LatencyMs}ms`);
  }

  return {
    total: results.length,
    passed,
    passRate,
    p95LatencyMs,
    categories,
    gate: { passed: reasons.length === 0, reasons },
  };
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

export function toMarkdown(results: CaseResult[], summary: Summary): string {
  const lines = [
    '# AI evaluation report',
    '',
    `Gate: **${summary.gate.passed ? 'PASS' : 'FAIL'}**`,
    `Overall: ${summary.passed}/${summary.total} (${pct(summary.passRate)}), p95 latency ${Math.round(summary.p95LatencyMs)}ms`,
    '',
    '| Category | Passed | Total | Rate |',
    '| --- | --- | --- | --- |',
    ...summary.categories.map(
      (c) => `| ${c.category} | ${c.passed} | ${c.total} | ${pct(c.passRate)} |`,
    ),
  ];
  if (summary.gate.reasons.length > 0) {
    lines.push('', '## Why the gate failed', ...summary.gate.reasons.map((r) => `- ${r}`));
  }
  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    lines.push('', '## Failed cases');
    for (const r of failed) {
      lines.push(`- **${r.id}** (${r.category}): "${r.input}"`);
      for (const c of r.checks.filter((x) => !x.passed)) lines.push(`  - ${c.name}: ${c.detail}`);
    }
  }
  return lines.join('\n') + '\n';
}
