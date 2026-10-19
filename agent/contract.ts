import { z } from 'zod';
import { INTENTS } from '../ai/contract';

/** The agent can return two intents the plain chat service cannot. */
export const AGENT_INTENTS = [...INTENTS, 'application_status', 'callback_request'] as const;
export type AgentIntent = (typeof AGENT_INTENTS)[number];

export const AgentChatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  sessionId: z.string().min(8).max(64).optional(),
});

export const ApprovalRequestSchema = z.object({
  approvalId: z.string().min(8).max(64),
  approved: z.boolean(),
});

export const PendingApprovalSchema = z.object({
  approvalId: z.string(),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
});

export const AgentResponseSchema = z.object({
  reply: z.string().min(1),
  intent: z.enum(AGENT_INTENTS),
  escalated: z.boolean(),
  requestId: z.string().min(8),
  toolsUsed: z.array(z.string()),
  pendingApproval: PendingApprovalSchema.optional(),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

/** What the planner model must output on every step. */
export const PlannerDecisionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('call_tool'),
    tool: z.string(),
    args: z.record(z.string(), z.unknown()).default({}),
  }),
  z.object({
    action: z.literal('answer'),
    reply: z.string().min(1),
    intent: z.enum(AGENT_INTENTS),
    escalated: z.boolean(),
  }),
]);
export type PlannerDecision = z.infer<typeof PlannerDecisionSchema>;
