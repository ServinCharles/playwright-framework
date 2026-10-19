import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { generateDraft } from '../ai/generator/generate';
import { anthropicProvider, mockProvider } from '../ai/generator/providers';
import { computeStats, readLog } from '../ai/review/log';
import { dataset, runAll, summarise } from '../ai/eval/runner';
import { buildServer } from '../mock-chat-api/server';
import { env } from '../utils/env';

const ROOT = path.resolve(__dirname, '..');

/**
 * What this server lets an AI assistant do, and (just as important) what it does not.
 * It can run tests, run evals, read reports and ask for a DRAFT test.
 * It can NOT promote a draft into the suite. That stays with a named human reviewer.
 */
export const SUITES = ['unit', 'api', 'ai-eval'] as const;
export const TAGS = ['@smoke', '@regression', '@critical'] as const;

export interface TestRunSummary {
  suite: string;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  failures: string[];
}

interface PwSuite {
  title?: string;
  specs?: { title: string; ok: boolean }[];
  suites?: PwSuite[];
}

export type TestRunner = (
  suite: (typeof SUITES)[number],
  tag?: (typeof TAGS)[number],
) => Promise<TestRunSummary>;

/** Runs Playwright with fixed arguments only (no shell, no free-text arguments). */
export const defaultTestRunner: TestRunner = (suite, tag) =>
  new Promise((resolve, reject) => {
    const args = ['playwright', 'test', `--project=${suite}`, '--reporter=json'];
    if (tag) args.push('--grep', tag);
    execFile(
      'npx',
      args,
      { cwd: ROOT, timeout: 5 * 60_000, maxBuffer: 20 * 1024 * 1024 },
      (error, stdout) => {
        try {
          const report = JSON.parse(stdout) as {
            stats: { expected: number; unexpected: number; flaky: number; skipped: number };
            suites: PwSuite[];
          };
          const failures: string[] = [];
          const walk = (nodes: PwSuite[], trail: string[] = []): void => {
            for (const node of nodes) {
              const next = node.title ? [...trail, node.title] : trail;
              for (const spec of node.specs ?? []) {
                if (!spec.ok) failures.push([...next, spec.title].join(' > '));
              }
              walk(node.suites ?? [], next);
            }
          };
          walk(report.suites);
          resolve({
            suite,
            passed: report.stats.expected,
            failed: report.stats.unexpected,
            flaky: report.stats.flaky,
            skipped: report.stats.skipped,
            failures,
          });
        } catch {
          reject(
            new Error(`Playwright did not produce a report: ${error?.message ?? 'unknown error'}`),
          );
        }
      },
    );
  });

const text = (value: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    },
  ],
});
const fail = (message: string) => ({ isError: true, ...text(message) });

/** Only files directly inside requirements/ may be used to draft a test. */
export function resolveRequirement(name: string): string | undefined {
  const dir = path.join(ROOT, 'requirements');
  const full = path.resolve(dir, name);
  if (path.dirname(full) !== dir || !full.endsWith('.md')) return undefined;
  return fs.existsSync(full) ? full : undefined;
}

async function evalInProcess(mode: 'safe' | 'buggy') {
  const server = buildServer(mode);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const url = `http://localhost:${(server.address() as AddressInfo).port}`;
    return summarise(await runAll(url));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

export interface McpDeps {
  runTests?: TestRunner;
  /** Where drafts and the audit log go. Tests point these at a temp folder. */
  draftDir?: string;
  logFile?: string;
}

export function createMcpServer(deps: McpDeps = {}): McpServer {
  const runTests = deps.runTests ?? defaultTestRunner;
  const server = new McpServer({ name: 'playwright-ai-framework', version: '1.0.0' });

  server.registerTool(
    'run_tests',
    {
      title: 'Run a test suite',
      description:
        'Runs one suite (unit, api or ai-eval) and returns pass/fail counts and failing test names. UI tests are not exposed because they need a browser and the live site.',
      inputSchema: { suite: z.enum(SUITES), tag: z.enum(TAGS).optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ suite, tag }) => {
      try {
        return text(await runTests(suite, tag));
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  );

  server.registerTool(
    'run_eval',
    {
      title: 'Run the AI evaluation',
      description:
        'Runs the golden dataset against the built-in mock chat API and returns the quality gate result. mode "buggy" proves the gate can fail.',
      inputSchema: { mode: z.enum(['safe', 'buggy']).default('safe') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ mode }) => {
      const summary = await evalInProcess(mode);
      return text({
        passRate: summary.passRate,
        gate: summary.gate,
        categories: summary.categories,
        p95LatencyMs: summary.p95LatencyMs,
      });
    },
  );

  server.registerTool(
    'list_eval_cases',
    {
      title: 'List eval cases',
      description: 'Lists golden dataset cases, optionally for one category.',
      inputSchema: { category: z.string().max(40).optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ category }) =>
      text(
        dataset
          .filter((c) => !category || c.category === category)
          .map(({ id, category: cat, input }) => ({ id, category: cat, input })),
      ),
  );

  server.registerTool(
    'get_eval_report',
    {
      title: 'Latest eval report',
      description: 'Returns the summary from the most recent `npm run eval` on this machine.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const file = path.join(ROOT, 'reports/eval/latest.json');
      if (!fs.existsSync(file)) return fail('No report yet. Run `npm run eval` first.');
      return text(JSON.parse(fs.readFileSync(file, 'utf-8')).summary);
    },
  );

  server.registerTool(
    'generate_test_draft',
    {
      title: 'Draft a test from a requirement',
      description:
        'Creates a DRAFT spec in ai-generated/ from a file in requirements/. Drafts never run in CI and must be reviewed and promoted by a named person outside this tool.',
      inputSchema: { requirement: z.string().min(1).max(100) },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ requirement }) => {
      const file = resolveRequirement(requirement);
      if (!file)
        return fail('Requirement must be an existing .md file directly inside requirements/.');
      const provider = env.anthropicApiKey
        ? anthropicProvider(env.anthropicApiKey, env.anthropicModel)
        : mockProvider;
      const result = await generateDraft(file, provider, deps.draftDir, deps.logFile);
      return result.ok
        ? text({
            draft: path.relative(ROOT, result.file),
            provider: provider.name,
            next: 'A person must review it, then run npm run ai:promote with their name.',
          })
        : fail(`Draft failed validation: ${result.problems.join('; ')}`);
    },
  );

  server.registerTool(
    'review_stats',
    {
      title: 'AI test review statistics',
      description: 'Acceptance, edit and rejection rates for AI-generated tests.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => text(computeStats(readLog(deps.logFile))),
  );

  return server;
}
