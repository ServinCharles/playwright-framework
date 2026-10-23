import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

export const env = {
  baseUrl: process.env.BASE_URL ?? 'https://www.saucedemo.com',
  chatApiUrl: process.env.CHAT_API_URL ?? 'http://localhost:3100',
  isCloud: process.env.execution === 'cloud',
  isCI: !!process.env.CI,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
  /** Sent as x-api-key to the chat service when it has a key configured. */
  chatApiKey: process.env.CHAT_API_KEY || undefined,
};

/** True when the URL points at this machine, so the built-in mock chat API can serve it. */
export const isLocalUrl = (url: string): boolean => {
  try {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
};
