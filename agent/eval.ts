import fs from 'fs';
import path from 'path';
import type { Agent } from './graph';

export interface AgentCase {
  id: string;
  category: string;
  input: string;
  expect: {
    tools: string[];
    intent?: string;
    escalated?: boolean;
    needsApproval?: string;
    mustContain?: string[];
    mustNotContain?: string[];
  };
}

export const agentDataset: AgentCase[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'eval-dataset.json'), 'utf-8'),
);

export interface AgentCaseResult {
  id: string;
  category: string;
  passed: boolean;
  failures: string[];
}

/** Checks which tools ran, whether approval was requested, and the answer itself. */
export async function runAgentCase(agent: Agent, testCase: AgentCase): Promise<AgentCaseResult> {
  const out = await agent.start(testCase.input);
  const failures: string[] = [];
  const { expect } = testCase;
  const reply = out.reply.toLowerCase();

  if (JSON.stringify(out.toolsUsed) !== JSON.stringify(expect.tools)) {
    failures.push(`tools: expected [${expect.tools}], got [${out.toolsUsed}]`);
  }
  if (expect.intent && out.intent !== expect.intent) {
    failures.push(`intent: expected ${expect.intent}, got ${out.intent}`);
  }
  if (expect.escalated !== undefined && out.escalated !== expect.escalated) {
    failures.push(`escalated: expected ${expect.escalated}, got ${out.escalated}`);
  }
  if (expect.needsApproval) {
    if (out.pendingApproval?.tool !== expect.needsApproval) {
      failures.push(`approval: expected request for ${expect.needsApproval}`);
    }
  } else if (out.pendingApproval) {
    failures.push('approval: unexpected approval request');
  }
  for (const phrase of expect.mustContain ?? []) {
    if (!reply.includes(phrase.toLowerCase())) failures.push(`missing "${phrase}"`);
  }
  for (const phrase of expect.mustNotContain ?? []) {
    if (reply.includes(phrase.toLowerCase())) failures.push(`contains forbidden "${phrase}"`);
  }
  return { id: testCase.id, category: testCase.category, passed: failures.length === 0, failures };
}
