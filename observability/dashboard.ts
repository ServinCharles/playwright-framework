/**
 * Builds one static HTML page from the files this framework already writes:
 *   reports/eval/history.csv   eval runs over time
 *   reports/eval/latest.json   latest eval by category
 *   reports/traces/spans.jsonl spans from the chat service and agent (TRACE_FILE)
 *   ai/review-log.csv          AI-generated test review decisions
 * No server, no dependencies. Open reports/dashboard/index.html.     npm run dashboard
 */
import fs from 'fs';
import path from 'path';
import { computeStats, readLog, type Stats } from '../ai/review/log';
import type { SpanRecord } from './tracing';

const ROOT = path.resolve(__dirname, '..');

export interface HistoryRow {
  timestamp: string;
  total: number;
  passed: number;
  passRate: number;
  p95Ms: number;
  gate: 'pass' | 'fail';
}

export interface CategoryRow {
  category: string;
  passed: number;
  total: number;
}

export interface DashboardData {
  generatedAt: string;
  history: HistoryRow[];
  categories: CategoryRow[];
  spans: SpanRecord[];
  review: Stats;
}

export const escapeHtml = (value: unknown): string =>
  String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function parseHistory(csv: string): HistoryRow[] {
  return csv
    .split('\n')
    .slice(1)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [timestamp, total, passed, passRate, p95Ms, gate] = line.split(',');
      return {
        timestamp,
        total: Number(total),
        passed: Number(passed),
        passRate: Number(passRate),
        p95Ms: Number(p95Ms),
        gate: gate === 'pass' ? 'pass' : 'fail',
      } as HistoryRow;
    })
    .filter((row) => Number.isFinite(row.passRate));
}

export function parseSpans(jsonl: string): SpanRecord[] {
  const spans: SpanRecord[] = [];
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    try {
      spans.push(JSON.parse(line) as SpanRecord);
    } catch {
      // A half-written last line must not break the dashboard
    }
  }
  return spans;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function countBy(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function traceSummary(spans: SpanRecord[]) {
  const requests = spans.filter((s) => s.name === 'chat.request' || s.name === 'agent.run');
  const calls = spans.filter((s) => s.name === 'llm.call');
  const guards = new Map<string, number>();
  for (const s of requests) {
    const hit = String(s.attributes['guard.hit'] ?? 'none');
    if (hit !== 'none') guards.set(hit, (guards.get(hit) ?? 0) + 1);
  }
  const callMs = calls.map((s) => s.durationMs);
  return {
    requests: requests.length,
    escalated: requests.filter((s) => s.attributes.escalated === true).length,
    llmCalls: calls.length,
    llmFailures: calls.filter((s) => !s.ok).length,
    llmP50: percentile(callMs, 50),
    llmP95: percentile(callMs, 95),
    requestP95: percentile(
      requests.map((s) => s.durationMs),
      95,
    ),
    guards: [...guards.entries()].sort((a, b) => b[1] - a[1]),
    toolRuns: spans.filter((s) => s.name === 'agent.act' && s.attributes.tool).length,
    tools: countBy(
      spans
        .filter((s) => s.name === 'agent.act' && s.attributes.tool)
        .map((s) => String(s.attributes.tool)),
    ),
    approvals: spans.filter((s) => s.name === 'agent.approval' && s.attributes.paused === true)
      .length,
    slowest: [...requests].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5),
  };
}

const ms = (value: number): string =>
  (value < 10 ? value.toFixed(1) : String(Math.round(value))) + ' ms';

function lineChart(rows: HistoryRow[]): string {
  if (rows.length === 0)
    return '<p class="empty">No eval runs yet. Run <code>npm run eval</code>.</p>';
  const w = 560;
  const h = 150;
  const pad = 48;
  const x = (i: number): number =>
    rows.length === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (rows.length - 1);
  const y = (rate: number): number => pad / 2 + (1 - rate) * (h - pad);
  const points = rows.map((r, i) => `${x(i).toFixed(1)},${y(r.passRate).toFixed(1)}`).join(' ');
  const dots = rows
    .map(
      (r, i) =>
        `<circle cx="${x(i).toFixed(1)}" cy="${y(r.passRate).toFixed(1)}" r="4" class="${r.gate === 'pass' ? 'dot-ok' : 'dot-bad'}"><title>${escapeHtml(r.timestamp)}: ${(r.passRate * 100).toFixed(0)}% (${escapeHtml(r.gate)})</title></circle>`,
    )
    .join('');
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Eval pass rate over time">
    <line x1="${pad}" x2="${w - 4}" y1="${y(1)}" y2="${y(1)}" class="grid"/><line x1="${pad}" x2="${w - 4}" y1="${y(0.5)}" y2="${y(0.5)}" class="grid"/><line x1="${pad}" x2="${w - 4}" y1="${y(0)}" y2="${y(0)}" class="grid"/>
    <text x="2" y="${y(1) + 4}" class="axis">100%</text><text x="2" y="${y(0.5) + 4}" class="axis">50%</text><text x="2" y="${y(0) + 4}" class="axis">0%</text>
    <polyline points="${points}" class="line"/>${dots}</svg>`;
}

function bars(
  items: { label: string; value: number; max: number; note?: string; bad?: boolean }[],
): string {
  if (items.length === 0) return '<p class="empty">Nothing recorded yet.</p>';
  return `<div class="bars">${items
    .map(
      (item) => `<div class="bar-row"><span class="bar-label">${escapeHtml(item.label)}</span>
      <span class="bar-track"><span class="bar-fill${item.bad ? ' bad' : ''}" style="width:${Math.max(2, (item.value / Math.max(item.max, 1)) * 100).toFixed(1)}%"></span></span>
      <span class="bar-note">${escapeHtml(item.note ?? item.value)}</span></div>`,
    )
    .join('')}</div>`;
}

export function buildHtml(data: DashboardData): string {
  const latest = data.history.at(-1);
  const trace = traceSummary(data.spans);
  const gateLabel = latest
    ? latest.gate === 'pass'
      ? 'Quality gate: pass'
      : 'Quality gate: FAIL'
    : 'No eval run yet';

  const categoryBars = bars(
    data.categories.map((c) => ({
      label: c.category,
      value: c.passed,
      max: c.total,
      note: `${c.passed}/${c.total}`,
      bad: c.passed < c.total,
    })),
  );
  const guardBars = bars(
    trace.guards.map(([label, value]) => ({ label, value, max: trace.requests })),
  );
  const reviewBars = bars(
    [
      { label: 'generated', value: data.review.generated },
      { label: 'accepted', value: data.review.accepted },
      { label: 'edited', value: data.review.edited },
      { label: 'rejected', value: data.review.rejected },
      { label: 'pending', value: data.review.pending },
    ].map((r) => ({ ...r, max: Math.max(data.review.generated, 1) })),
  );
  const slowRows = trace.slowest
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.attributes.intent ?? '')}</td><td>${escapeHtml(s.attributes['guard.hit'] ?? '')}</td><td class="num">${escapeHtml(ms(s.durationMs))}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Test Dashboard</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--text:#1b1f24;--muted:#5d6672;--line:#e3e6ea;--accent:#2f6fed;--ok:#1a7f4b;--bad:#c4321f}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14171b;--card:#1d2127;--text:#e8ebef;--muted:#9aa4b0;--line:#2c323a;--accent:#6c9bff;--ok:#4cc38a;--bad:#ff7a66}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:1000px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1rem;margin:0 0 12px}.sub{color:var(--muted);margin:0 0 20px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;min-width:0;overflow-x:auto}.wide{grid-column:1/-1}
.kpis{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:16px}
.kpi .v{font-size:1.6rem;font-weight:650}.kpi .l{color:var(--muted);font-size:.85rem}.ok{color:var(--ok)}.badtxt{color:var(--bad)}
svg{width:100%;height:auto}.grid line,svg .grid{stroke:var(--line)}.axis{fill:var(--muted);font-size:13px}.line{fill:none;stroke:var(--accent);stroke-width:2}
.dot-ok{fill:var(--ok)}.dot-bad{fill:var(--bad)}
.bar-row{display:grid;grid-template-columns:170px 1fr 56px;gap:8px;align-items:center;margin:6px 0}
.bar-label{color:var(--muted);font-size:.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-track{background:var(--line);border-radius:4px;height:10px;overflow:hidden}.bar-fill{display:block;height:100%;background:var(--accent)}.bar-fill.bad{background:var(--bad)}
.bar-note{text-align:right;font-variant-numeric:tabular-nums;font-size:.85rem}
table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap}.num{text-align:right;font-variant-numeric:tabular-nums}
.empty{color:var(--muted);margin:0}code{background:var(--line);padding:1px 5px;border-radius:4px}
@media (max-width:480px){.bar-row{grid-template-columns:90px 1fr 48px}}
</style></head><body><main>
<h1>AI Test Dashboard</h1>
<p class="sub">Generated ${escapeHtml(data.generatedAt)} from local report files. Customer messages are never recorded.</p>

<div class="kpis">
  <div class="card kpi"><div class="v ${latest?.gate === 'fail' ? 'badtxt' : 'ok'}">${escapeHtml(gateLabel)}</div><div class="l">latest eval run</div></div>
  <div class="card kpi"><div class="v">${latest ? `${latest.passed}/${latest.total}` : 'n/a'}</div><div class="l">eval cases passed</div></div>
  <div class="card kpi"><div class="v">${trace.requests}</div><div class="l">traced requests</div></div>
  <div class="card kpi"><div class="v">${trace.requests ? `${Math.round((trace.escalated / trace.requests) * 100)}%` : 'n/a'}</div><div class="l">handed to a human</div></div>
  <div class="card kpi"><div class="v">${trace.llmCalls ? escapeHtml(ms(trace.llmP95)) : 'n/a'}</div><div class="l">LLM call p95</div></div>
  <div class="card kpi"><div class="v ${trace.llmFailures ? 'badtxt' : ''}">${trace.llmFailures}</div><div class="l">LLM call failures</div></div>
</div>

<div class="grid">
  <section class="card wide"><h2>Eval pass rate over runs</h2>${lineChart(data.history)}</section>
  <section class="card"><h2>Latest eval by category</h2>${categoryBars}</section>
  <section class="card"><h2>Guards that fired (traced requests)</h2>${guardBars}</section>
  <section class="card"><h2>AI-generated test review</h2>${reviewBars}
    <p class="empty" style="margin-top:8px">Acceptance ${(data.review.acceptanceRate * 100).toFixed(0)}% · edited ${(data.review.editRate * 100).toFixed(0)}% · rejected ${(data.review.rejectionRate * 100).toFixed(0)}%</p></section>
  <section class="card wide"><h2>Slowest requests</h2>${
    slowRows
      ? `<table><thead><tr><th>Span</th><th>Intent</th><th>Guard</th><th class="num">Time</th></tr></thead><tbody>${slowRows}</tbody></table>`
      : '<p class="empty">No traces yet. Run <code>npm run demo:traces</code> or start a service with <code>TRACE_FILE</code> set.</p>'
  }</section>
  <section class="card"><h2>Agent tool calls</h2>${bars(trace.tools.map(([label, value]) => ({ label, value, max: trace.toolRuns })))}
    <p class="empty" style="margin-top:8px">${trace.approvals} request(s) paused for human approval.</p></section>
</div>
</main></body></html>`;
}

function readIfExists(file: string): string {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
}

export function collect(root = ROOT): DashboardData {
  let categories: CategoryRow[] = [];
  const latest = readIfExists(path.join(root, 'reports/eval/latest.json'));
  if (latest) {
    try {
      categories = (JSON.parse(latest).summary.categories as CategoryRow[]).map(
        ({ category, passed, total }) => ({ category, passed, total }),
      );
    } catch {
      categories = [];
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    history: parseHistory(readIfExists(path.join(root, 'reports/eval/history.csv'))),
    categories,
    spans: parseSpans(readIfExists(path.join(root, 'reports/traces/spans.jsonl'))),
    review: computeStats(readLog(path.join(root, 'ai/review-log.csv'))),
  };
}

if (require.main === module) {
  const out = path.join(ROOT, 'reports/dashboard/index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buildHtml(collect()));
  console.log(`Dashboard written: ${path.relative(process.cwd(), out)}`);
}
