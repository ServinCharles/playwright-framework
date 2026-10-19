import { env } from '../../utils/env';
import { anthropicClient, type LlmClient } from './client';

/** Returns a real client when ANTHROPIC_API_KEY is set, otherwise undefined. */
export function createLlmClient(): LlmClient | undefined {
  return env.anthropicApiKey ? anthropicClient(env.anthropicApiKey, env.anthropicModel) : undefined;
}
