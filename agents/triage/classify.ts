/**
 * Triage agent, step 1: sort each failed eval case into one cause, using fixed rules.
 *
 * The rules read the eval report only. Nothing here changes the bot, the dataset, the rubrics
 * or the thresholds. A person decides what to do with each finding.
 */
import { percentile } from '../../ai/eval/scorers';

export interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface EvalResult {
  id: string;
  category: string;
  input: string;
  passed: boolean;
  latencyMs: number;
  checks: CheckResult[];
}

export type Cause = 'routing' | 'handoff' | 'quality' | 'wording' | 'similarity' | 'unclassified';

export interface Finding {
  id: string;
  category: string;
  cause: Cause;
  evidence: string[];
  nextStep: string;
}

export interface TriageReport {
  totalCases: number;
  failedCases: number;
  p95LatencyMs: number;
  latencyLimitMs: number;
  latencyOverLimit: boolean;
  findings: Finding[];
}

const MAX_EVIDENCE_CHARS = 300;

const isPhraseCheck = (name: string): boolean =>
  name.startsWith('contains "') || name.startsWith('does not contain');
const isSimilarityCheck = (name: string): boolean => name === 'semantically close to reference';
const isJudgeCheck = (name: string): boolean => name.startsWith('judge');

const NEXT_STEP: Record<Cause, string> = {
  routing:
    'The bot picked a different intent. Check the intent policy and the system prompt before changing the check.',
  handoff:
    'The escalation flag changed. Check whether the reply should have handed over to a person.',
  quality:
    'The judge scored the reply below its bar. Read the reply yourself. If it is wrong, fix the bot. If it is right, check the rubric.',
  wording:
    'The exact phrase is missing. If the reply is correct, add the wording as an alternative in mustContain. Do not loosen a check for a wrong reply.',
  similarity:
    'The reply is close in meaning but below the minimum. Compare it with semanticReference. Change the reference wording, or calibrate the threshold (issue #3). Do not lower the threshold for one case.',
  unclassified: 'No rule matched. Review this case by hand.',
};

/** One finding per failed case, or undefined when the case passed. */
export function classifyFailure(result: EvalResult): Finding | undefined {
  if (result.passed) return undefined;

  const failed = result.checks.filter((check) => !check.passed);
  const evidence = failed.map((check) =>
    `${check.name}: ${(check.detail ?? '').slice(0, MAX_EVIDENCE_CHARS)}`.trim(),
  );
  const hasFailed = (predicate: (name: string) => boolean): boolean =>
    failed.some((check) => predicate(check.name));
  const judge = result.checks.find((check) => isJudgeCheck(check.name));

  let cause: Cause;
  if (hasFailed((name) => name === 'intent')) cause = 'routing';
  else if (hasFailed((name) => name === 'escalated')) cause = 'handoff';
  else if (judge && !judge.passed) cause = 'quality';
  else if (hasFailed(isPhraseCheck)) cause = 'wording';
  else if (hasFailed(isSimilarityCheck)) cause = 'similarity';
  else cause = 'unclassified';

  return { id: result.id, category: result.category, cause, evidence, nextStep: NEXT_STEP[cause] };
}

export function buildReport(results: EvalResult[], latencyLimitMs: number): TriageReport {
  const p95LatencyMs = percentile(
    results.map((result) => result.latencyMs),
    95,
  );
  const findings = results
    .map(classifyFailure)
    .filter((finding): finding is Finding => finding !== undefined);
  return {
    totalCases: results.length,
    failedCases: findings.length,
    p95LatencyMs,
    latencyLimitMs,
    latencyOverLimit: p95LatencyMs > latencyLimitMs,
    findings,
  };
}

export function toMarkdown(report: TriageReport): string {
  const lines: string[] = [];
  lines.push('# Eval triage');
  lines.push('');
  lines.push(
    `${report.failedCases} of ${report.totalCases} cases failed. p95 latency ${Math.round(report.p95LatencyMs)} ms (limit ${report.latencyLimitMs} ms).`,
  );
  lines.push('');
  lines.push(
    report.latencyOverLimit
      ? '**Latency:** p95 is over the limit. Check the chat service and the model response times. Do not raise the limit to pass the gate.'
      : '**Latency:** within the limit.',
  );
  lines.push('');
  lines.push(
    'This report only groups the failures. It changes nothing. A person decides each case.',
  );

  for (const finding of report.findings) {
    lines.push('');
    lines.push(`## ${finding.id} (${finding.category}): ${finding.cause}`);
    lines.push('');
    lines.push(`**Next step:** ${finding.nextStep}`);
    lines.push('');
    for (const item of finding.evidence) lines.push(`- ${item}`);
    lines.push('');
    lines.push('Decision: [ ] fix the bot  [ ] fix the check  [ ] accept  Reviewer: ______');
  }
  return `${lines.join('\n')}\n`;
}
