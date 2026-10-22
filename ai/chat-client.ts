import { ChatResponseSchema, type ChatResponse } from './contract';
import { env } from '../utils/env';

export interface ChatCall {
  status: number;
  latencyMs: number;
  body: unknown;
}

/** Raw call: returns whatever the API sent, so tests can also check error responses. */
export async function callChat(message: unknown, baseUrl = env.chatApiUrl): Promise<ChatCall> {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env.chatApiKey ? { 'x-api-key': env.chatApiKey } : {}),
    },
    body: JSON.stringify({ message }),
  });
  const latencyMs = performance.now() - started;
  return { status: response.status, latencyMs, body: await response.json() };
}

/** Happy-path call: throws if the response breaks the contract. */
export async function ask(
  message: string,
  baseUrl = env.chatApiUrl,
): Promise<{ response: ChatResponse; latencyMs: number }> {
  const { status, body, latencyMs } = await callChat(message, baseUrl);
  if (status !== 200) throw new Error(`Chat API returned ${status}: ${JSON.stringify(body)}`);
  return { response: ChatResponseSchema.parse(body), latencyMs };
}
