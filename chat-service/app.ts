import type http from 'http';
import type { LlmClient } from '../ai/llm/client';
import { buildServer } from '../mock-chat-api/server';
import { createWebhookSender, type SenderOptions, type WebhookSender } from '../webhooks/sender';
import { createTracedAssistant } from './traced';

export interface ChatServiceOptions {
  llm: LlmClient;
  /** When set, every escalation to a human also sends a signed webhook. */
  webhook?: SenderOptions;
}

export interface ChatService {
  server: http.Server;
  sender?: WebhookSender;
}

/** The whole service wired together: guards + LLM + tracing + optional escalation webhook. */
export function buildChatService({ llm, webhook }: ChatServiceOptions): ChatService {
  const sender = webhook ? createWebhookSender(webhook) : undefined;
  const server = buildServer(createTracedAssistant(llm), {
    onResult: sender
      ? async ({ requestId, result }) => {
          if (result.escalated) await sender.send(sender.escalation(requestId, result.intent));
        }
      : undefined,
  });
  return { server, sender };
}
