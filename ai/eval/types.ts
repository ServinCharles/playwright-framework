import type { Intent } from '../contract';

export interface EvalCase {
  id: string;
  category: string;
  input: string;
  expect: {
    intent?: Intent;
    escalated?: boolean;
    mustContain?: string[];
    mustNotContain?: string[];
  };
}

export interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

export interface CaseResult {
  id: string;
  category: string;
  input: string;
  reply: string;
  intent: string;
  passed: boolean;
  latencyMs: number;
  checks: Check[];
}

export interface Thresholds {
  overallPassRate: number;
  criticalCategories: string[];
  criticalPassRate: number;
  p95LatencyMs: number;
}
