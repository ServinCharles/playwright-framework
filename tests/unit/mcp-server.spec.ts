import fs from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, resolveRequirement, type TestRunner } from '../../mcp/server';

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
// The real draft folder may already hold a human's drafts, so tests compare its contents
const realDraftDir = path.resolve(__dirname, '../../ai-generated');
const listRealDrafts = (): string[] =>
  fs.existsSync(realDraftDir) ? fs.readdirSync(realDraftDir).sort() : [];

const draftDir = path.join(sandbox, 'ai-generated');
const logFile = path.join(sandbox, 'review-log.csv');

test.afterAll(() => fs.rmSync(sandbox, { recursive: true, force: true }));

async function connect(runTests?: TestRunner) {
  const server = createMcpServer({ runTests, draftDir, logFile });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

// Tool results are free-form JSON, so tests read them loosely
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const payload = (result: unknown): any => {
  const first = (result as { content: { text: string }[] }).content[0].text;
  try {
    return JSON.parse(first);
  } catch {
    return first;
  }
};

test.describe('MCP server', () => {
  test('exposes the expected tools and NOT the promote action @critical', async () => {
    const client = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'generate_test_draft',
      'get_eval_report',
      'list_eval_cases',
      'review_stats',
      'run_eval',
      'run_tests',
    ]);
    expect(names.join(' ')).not.toMatch(/promote|accept|approve|delete|exec|shell/i);
  });

  test('every tool has a description and an input schema @smoke', async () => {
    const client = await connect();
    for (const tool of (await client.listTools()).tools) {
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.inputSchema.type, tool.name).toBe('object');
    }
  });

  test('run_eval returns the gate result, and the buggy mode fails it @smoke', async () => {
    const client = await connect();
    const good = payload(await client.callTool({ name: 'run_eval', arguments: {} }));
    expect(good.gate.passed).toBe(true);
    const bad = payload(await client.callTool({ name: 'run_eval', arguments: { mode: 'buggy' } }));
    expect(bad.gate.passed).toBe(false);
  });

  test('list_eval_cases filters by category', async () => {
    const client = await connect();
    const cases = payload(
      await client.callTool({ name: 'list_eval_cases', arguments: { category: 'pii' } }),
    );
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.every((c: { category: string }) => c.category === 'pii')).toBe(true);
  });

  test('run_tests passes only allowlisted arguments to the runner @critical', async () => {
    const calls: unknown[][] = [];
    const client = await connect(async (suite, tag) => {
      calls.push([suite, tag]);
      return { suite, passed: 3, failed: 0, flaky: 0, skipped: 0, failures: [] };
    });
    const ok = payload(
      await client.callTool({ name: 'run_tests', arguments: { suite: 'api', tag: '@smoke' } }),
    );
    expect(ok.passed).toBe(3);
    expect(calls).toEqual([['api', '@smoke']]);

    // Anything outside the allowlist never reaches the runner
    for (const bad of [
      { suite: 'ui-chromium' },
      { suite: 'unit; rm -rf /' },
      { suite: 'unit', tag: '--config=evil.ts' },
    ]) {
      const result = (await client.callTool({ name: 'run_tests', arguments: bad })) as {
        isError?: boolean;
      };
      expect(result.isError, JSON.stringify(bad)).toBe(true);
    }
    expect(calls).toHaveLength(1);
  });

  test('a failing runner is reported as a tool error, not a crash', async () => {
    const client = await connect(async () => {
      throw new Error('Playwright did not produce a report');
    });
    const result = (await client.callTool({ name: 'run_tests', arguments: { suite: 'unit' } })) as {
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
  });

  test('generate_test_draft only reads requirements/ and writes a draft @critical', async () => {
    const before = listRealDrafts();

    const client = await connect();
    const outside = (await client.callTool({
      name: 'generate_test_draft',
      arguments: { requirement: '../package.json' },
    })) as { isError?: boolean };
    expect(outside.isError).toBe(true);

    const ok = payload(
      await client.callTool({
        name: 'generate_test_draft',
        arguments: { requirement: 'product-sorting.md' },
      }),
    );
    const draft = path.join(draftDir, 'product-sorting.spec.ts');
    expect(path.resolve(__dirname, '../..', ok.draft)).toBe(draft);
    expect(fs.readFileSync(draft, 'utf-8')).toContain('AI-GENERATED: NOT REVIEWED');
    expect(fs.readFileSync(logFile, 'utf-8')).toContain('generated');
    // Tests must not add to, or remove from, the real draft folder
    expect(listRealDrafts()).toEqual(before);
  });

  test('requirement path traversal is refused', () => {
    expect(resolveRequirement('../README.md')).toBeUndefined();
    expect(resolveRequirement('/etc/passwd')).toBeUndefined();
    expect(resolveRequirement('nope.md')).toBeUndefined();
    expect(resolveRequirement('product-sorting.md')).toBeDefined();
  });

  test('review_stats returns the counts', async () => {
    const client = await connect();
    const stats = payload(await client.callTool({ name: 'review_stats', arguments: {} }));
    expect(stats).toHaveProperty('generated');
    expect(stats).toHaveProperty('acceptanceRate');
  });

  test('works over real stdio, as an assistant would use it @smoke', async () => {
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', 'mcp/stdio.ts'],
      cwd: path.resolve(__dirname, '../..'),
    });
    const client = new Client({ name: 'stdio-test', version: '1.0.0' });
    await client.connect(transport);
    try {
      expect((await client.listTools()).tools).toHaveLength(6);
      const cases = payload(await client.callTool({ name: 'list_eval_cases', arguments: {} }));
      expect(cases).toHaveLength(30);
    } finally {
      await client.close();
    }
  });
});
