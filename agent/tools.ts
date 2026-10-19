import { z } from 'zod';

export interface Backend {
  /** Callback requests the agent has actually created. Tests assert on this. */
  callbacks: { reason: string; createdAt: string }[];
  applications: Record<string, { status: string; updatedOn: string }>;
}

export function createBackend(): Backend {
  return {
    callbacks: [],
    applications: {
      'APP-100001': { status: 'In review', updatedOn: '2026-10-12' },
      'APP-100002': { status: 'Awaiting documents', updatedOn: '2026-10-15' },
    },
  };
}

export interface Tool {
  name: string;
  description: string;
  args: z.ZodType<Record<string, unknown>>;
  /** Tools that change something must be approved by a human before they run. Enforced in code. */
  requiresApproval: boolean;
  run(args: Record<string, unknown>, backend: Backend): unknown;
}

const money = z.number().positive().max(100_000_000);

export const TOOLS: Tool[] = [
  {
    name: 'check_aip_eligibility',
    description:
      'Indicative only. Args: annualIncome, deposit, propertyPrice (numbers in GBP). Returns an estimate, never a decision.',
    args: z.object({ annualIncome: money, deposit: money, propertyPrice: money }).strict(),
    requiresApproval: false,
    run: (args) => {
      const { annualIncome, deposit, propertyPrice } = args as Record<string, number>;
      const loan = propertyPrice - deposit;
      const maxLoan = Math.round(annualIncome * 4.5);
      const ltv = loan / propertyPrice;
      return {
        indicativeOnly: true,
        loanNeeded: loan,
        indicativeMaxLoan: maxLoan,
        loanToValue: Number(ltv.toFixed(2)),
        likelyWithinRange: loan > 0 && loan <= maxLoan && ltv <= 0.95,
      };
    },
  },
  {
    name: 'lookup_application_status',
    description: 'Read-only. Args: applicationId like APP-123456.',
    args: z.object({ applicationId: z.string().regex(/^APP-\d{6}$/) }).strict(),
    requiresApproval: false,
    run: (args, backend) => {
      const found = backend.applications[String(args.applicationId)];
      return found ?? { status: 'Not found' };
    },
  },
  {
    name: 'create_callback_request',
    description:
      'Books a call back from a colleague. Changes data, so a human must approve. Args: reason (short text).',
    args: z.object({ reason: z.string().min(1).max(200) }).strict(),
    requiresApproval: true,
    run: (args, backend) => {
      backend.callbacks.push({
        reason: String(args.reason),
        createdAt: new Date().toISOString(),
      });
      return { created: true };
    },
  },
];

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((tool) => tool.name === name);
}

export function toolCatalogue(): string {
  return TOOLS.map(
    (tool) =>
      `- ${tool.name}${tool.requiresApproval ? ' (needs human approval)' : ''}: ${tool.description}`,
  ).join('\n');
}
