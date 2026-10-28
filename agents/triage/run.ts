/**
 * Triage agent, step 2: read an eval report, write a triage report. Changes nothing else.
 *
 *   npm run triage                          # reads reports/eval/latest.json
 *   npm run triage -- path/to/report.json   # reads another report
 *   TRIAGE_P95_LIMIT_MS=5000 npm run triage  # latency limit (default: the live limit)
 *
 * Writes reports/triage/latest.md. It never exits non-zero, because it does not gate anything.
 */
import fs from 'fs';
import path from 'path';
import { buildReport, toMarkdown, type EvalResult } from './classify';

const DEFAULT_INPUT = path.join('reports', 'eval', 'latest.json');
const OUTPUT = path.join('reports', 'triage', 'latest.md');
const LIVE_P95_LIMIT_MS = 5000;

function main(): void {
  const input = process.argv[2] ?? DEFAULT_INPUT;
  const limit = Number(process.env.TRIAGE_P95_LIMIT_MS ?? LIVE_P95_LIMIT_MS);
  if (!Number.isFinite(limit) || limit <= 0)
    throw new Error(
      `TRIAGE_P95_LIMIT_MS must be a positive number, got "${process.env.TRIAGE_P95_LIMIT_MS}"`,
    );

  const data = JSON.parse(fs.readFileSync(input, 'utf-8')) as { results?: EvalResult[] };
  if (!Array.isArray(data.results)) throw new Error(`${input} has no "results" list`);

  const report = buildReport(data.results, limit);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, toMarkdown(report));

  console.log(
    `Triage: ${report.failedCases} of ${report.totalCases} failed, p95 ${Math.round(report.p95LatencyMs)} ms.`,
  );
  console.log(`Report: ${OUTPUT}`);
}

main();
