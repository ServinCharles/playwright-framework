/**
 * Runs the golden dataset against the chat API, prints a table, writes reports and
 * exits non-zero when the quality gate fails, so CI can block a bad release.
 *
 *   npm run eval                          # evaluates the built-in mock
 *   CHAT_API_URL=https://... npm run eval # evaluates a real service
 *   CHAT_API_MODE=buggy npm run eval      # shows the gate failing
 *   JUDGE=1 npm run eval                  # also grade rubric cases with an LLM judge
 *   EVAL_LIVE=1 npm run eval:live         # real chat service on CHAT_API_URL, 3 runs per case
 */
import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import { buildServer } from '../../mock-chat-api/server';
import { env, isLocalUrl } from '../../utils/env';
import type { LlmClient } from '../llm/client';
import { anthropicClient } from '../llm/client';
import { runAll, summarise, toMarkdown } from './runner';

/** Uses CHAT_API_URL when it points to another machine, otherwise starts the local mock on a free port. */
const LIVE = process.env.EVAL_LIVE === '1';
// Live runs default to the chat service port (3101), not the mock default
const TARGET = LIVE ? (process.env.CHAT_API_URL ?? 'http://localhost:3101') : env.chatApiUrl;

async function withTarget<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  // A live run must hit the real service even when it runs on localhost
  if (LIVE || !isLocalUrl(TARGET)) return run(TARGET);

  const mode = process.env.CHAT_API_MODE === 'buggy' ? 'buggy' : 'safe';
  const server = buildServer(mode);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  console.log(`Evaluating the local mock chat API (mode: ${mode})`);
  try {
    return await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main(): Promise<void> {
  // JUDGE=1 grades cases that have a rubric with a real LLM (needs ANTHROPIC_API_KEY)
  let judge: LlmClient | undefined;
  if (process.env.JUDGE === '1' || LIVE) {
    // The judge can be a stronger model than the bot (JUDGE_MODEL)
    judge = env.anthropicApiKey
      ? anthropicClient(env.anthropicApiKey, process.env.JUDGE_MODEL ?? env.anthropicModel)
      : undefined;
    if (!judge)
      throw new Error('The judge needs ANTHROPIC_API_KEY. The judge must be a real model.');
    console.log(`LLM judge on: ${judge.name}`);
  }
  // Live runs repeat each case to show how much the real model varies
  const runs = Number(process.env.EVAL_RUNS ?? (LIVE ? 3 : 1));
  const results = await withTarget(async (baseUrl) => {
    const all = [];
    for (let i = 0; i < runs; i++) all.push(...(await runAll(baseUrl, judge)));
    return all;
  });
  const summary = summarise(results);

  const outDir = path.resolve(__dirname, '../../reports/eval');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify({ summary, results }, null, 2));
  fs.writeFileSync(path.join(outDir, 'latest.md'), toMarkdown(results, summary));

  const historyFile = path.join(outDir, 'history.csv');
  if (!fs.existsSync(historyFile))
    fs.writeFileSync(historyFile, 'timestamp,total,passed,pass_rate,p95_ms,gate\n');
  fs.appendFileSync(
    historyFile,
    `${new Date().toISOString()},${summary.total},${summary.passed},${summary.passRate.toFixed(3)},${Math.round(summary.p95LatencyMs)},${summary.gate.passed ? 'pass' : 'fail'}\n`,
  );

  console.table(
    summary.categories.map((c) => ({ category: c.category, passed: `${c.passed}/${c.total}` })),
  );
  console.log(
    `Overall ${summary.passed}/${summary.total}, p95 ${Math.round(summary.p95LatencyMs)}ms`,
  );
  if (!summary.gate.passed) {
    console.error('QUALITY GATE FAILED');
    summary.gate.reasons.forEach((r) => console.error(`- ${r}`));
    process.exit(1);
  }
  console.log('Quality gate passed. Report: reports/eval/latest.md');
}

main().catch((error) => {
  const unreachable = (error as { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED';
  console.error(
    unreachable
      ? `Cannot reach the chat API at ${TARGET}. Is it running?`
      : (error as Error).message,
  );
  process.exit(1);
});
