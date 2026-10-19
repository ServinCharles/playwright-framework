import { test, expect } from '@playwright/test';
import {
  buildHtml,
  escapeHtml,
  parseHistory,
  parseSpans,
  percentile,
  traceSummary,
  type DashboardData,
} from '../../observability/dashboard';
import type { SpanRecord } from '../../observability/tracing';

const span = (over: Partial<SpanRecord>): SpanRecord => ({
  traceId: 't',
  spanId: Math.random().toString(16).slice(2),
  name: 'chat.request',
  startMs: 0,
  durationMs: 10,
  ok: true,
  attributes: {},
  ...over,
});

const empty: DashboardData = {
  generatedAt: '2026-01-01T00:00:00Z',
  history: [],
  categories: [],
  spans: [],
  review: {
    generated: 0,
    accepted: 0,
    edited: 0,
    rejected: 0,
    pending: 0,
    acceptanceRate: 0,
    editRate: 0,
    rejectionRate: 0,
  },
};

test.describe('Dashboard', () => {
  test('renders with no data at all @smoke', () => {
    const html = buildHtml(empty);
    expect(html).toContain('No eval run yet');
    expect(html).toContain('No eval runs yet');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
  });

  test('escapes anything that came from a file @critical', () => {
    expect(escapeHtml('<script>alert("x")</script>')).not.toContain('<');
    const html = buildHtml({
      ...empty,
      spans: [
        span({ attributes: { intent: '<img src=x onerror=alert(1)>', 'guard.hit': 'none' } }),
      ],
    });
    expect(html).not.toContain('<img src=x');
  });

  test('parses history and skips damaged rows', () => {
    const csv =
      'timestamp,total,passed,pass_rate,p95_ms,gate\n2026-01-01T00:00:00Z,30,30,1.000,15,pass\ngarbage,x,y,z\n';
    const rows = parseHistory(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ passRate: 1, gate: 'pass' });
  });

  test('a half-written last line in the span file is ignored', () => {
    expect(parseSpans(`${JSON.stringify(span({}))}\n{"name":"chat.req`)).toHaveLength(1);
  });

  test('summarises guard hits, failures and latency', () => {
    const summary = traceSummary([
      span({ attributes: { 'guard.hit': 'prompt_leak', escalated: true }, durationMs: 30 }),
      span({ attributes: { 'guard.hit': 'none', escalated: false }, durationMs: 10 }),
      span({ name: 'llm.call', durationMs: 5, ok: false }),
      span({ name: 'agent.act', attributes: { tool: 'lookup_application_status' } }),
    ]);
    expect(summary.requests).toBe(2);
    expect(summary.escalated).toBe(1);
    expect(summary.llmFailures).toBe(1);
    expect(summary.guards).toEqual([['prompt_leak', 1]]);
    expect(summary.tools).toEqual([['lookup_application_status', 1]]);
    expect(summary.slowest[0].durationMs).toBe(30);
  });

  test('percentile handles empty and small lists', () => {
    expect(percentile([], 95)).toBe(0);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([1, 2, 3, 4, 100], 95)).toBe(100);
  });
});
