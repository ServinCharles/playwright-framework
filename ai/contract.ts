import { z } from 'zod';

/** Every intent the chat API is allowed to return. Adding one here is a deliberate contract change. */
export const INTENTS = [
  'password_reset',
  'username_recovery',
  'aip_info',
  'affordability',
  'financial_advice_refusal',
  'human_handoff',
  'blocked',
  'pii_warning',
  'fallback',
] as const;

export type Intent = (typeof INTENTS)[number];

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  sessionId: z.string().optional(),
});

export const ChatResponseSchema = z.object({
  reply: z.string().min(1),
  intent: z.enum(INTENTS),
  escalated: z.boolean(),
  requestId: z.string().min(8),
});

export const ErrorResponseSchema = z.object({ error: z.string().min(1) });

export type ChatResponse = z.infer<typeof ChatResponseSchema>;
