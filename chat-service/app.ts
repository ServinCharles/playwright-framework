import type http from 'http';
import type { LlmClient } from '../ai/llm/client';
import { buildServer } from '../mock-chat-api/server';
import { createWebhookSender, type SenderOptions, type WebhookSender } from '../webhooks/sender';
import { createTracedAssistant } from './traced';
import type { KnowledgeContext } from './knowledge';

export interface ChatServiceOptions {
  llm: LlmClient;
  /** When set, every escalation to a human also sends a signed webhook. */
  webhook?: SenderOptions;
  /** Approved documents for the model (RAG or CAG). Leave unset to answer without them. */
  knowledge?: KnowledgeContext;
}

export interface ChatService {
  server: http.Server;
  sender?: WebhookSender;
  /**
   * Resolves once every webhook started so far has finished (delivered or given up).
   * The chat reply does not wait for webhooks, so tests call this instead of sleeping.
   */
  flush: () => Promise<void>;
}

/** The whole service wired together: guards + LLM + tracing + optional escalation webhook. */
export function buildChatService({ llm, webhook, knowledge }: ChatServiceOptions): ChatService {
  const sender = webhook ? createWebhookSender(webhook) : undefined;
  const inFlight = new Set<Promise<unknown>>();

  const server = buildServer(createTracedAssistant(llm, { knowledge }), {
    onResult: sender
      ? ({ requestId, result }) => {
          if (!result.escalated) return;
          const delivery = sender.send(sender.escalation(requestId, result.intent));
          inFlight.add(delivery);
          void delivery.finally(() => inFlight.delete(delivery)).catch(() => undefined);
        }
      : undefined,
  });

  const flush = async (): Promise<void> => {
    await Promise.allSettled([...inFlight]);
  };

  return { server, sender, flush };
}
