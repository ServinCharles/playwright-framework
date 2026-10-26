import type { LlmClient } from '../ai/llm/client';
import { withSpan } from '../observability/tracing';
import { createLlmAssistant, type AssistantOptions, type Responder } from './llm-assistant';

/** Wraps any LLM client so each call becomes an "llm.call" span. */
export function tracedLlm(llm: LlmClient): LlmClient {
  return {
    name: llm.name,
    complete: (request) =>
      withSpan(
        'llm.call',
        { 'llm.client': llm.name, 'llm.prompt_chars': request.user.length },
        async (span) => {
          const response = await llm.complete(request);
          span.setAttributes({
            'llm.latency_ms': Math.round(response.latencyMs),
            'llm.input_tokens': response.usage?.inputTokens ?? 0,
            'llm.output_tokens': response.usage?.outputTokens ?? 0,
          });
          return response;
        },
      ),
  };
}

/**
 * Chat service with tracing: one "chat.request" span per message, with an "llm.call" child
 * for each model call. Attributes hold sizes and outcomes, never the customer's words.
 */
export function createTracedAssistant(llm: LlmClient, options: AssistantOptions = {}): Responder {
  const assistant = createLlmAssistant(tracedLlm(llm), options);
  return (message, authState) =>
    withSpan('chat.request', { 'message.chars': message.length }, async (span) => {
      const result = await assistant(message, authState);
      span.setAttributes({
        'user.state': authState ?? 'unset',
        intent: result.intent,
        escalated: result.escalated,
        'guard.hit': result.trace?.guard ?? 'none',
        'llm.calls': result.trace?.llmCalls ?? 0,
        'llm.repaired': result.trace?.repaired ?? false,
        'llm.error': result.trace?.llmError ? 'yes' : 'no',
      });
      return result;
    });
}
