import { randomUUID } from 'crypto';
import { ID_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER, sign } from './sign';

/** What we tell the receiver. Deliberately has no customer message text (it can contain PII). */
export interface EscalationEvent {
  id: string;
  type: 'chat.escalated';
  createdAt: string;
  requestId: string;
  intent: string;
}

export interface SenderOptions {
  url: string;
  secret: string;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  /** Injectable so tests do not really wait. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface SendOutcome {
  delivered: boolean;
  attempts: number;
  lastStatus?: number;
  error?: string;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Delivers one event with retries. The SAME event id is sent on every attempt, so a receiver
 * that already processed it can safely ignore the repeat (at-least-once delivery + idempotency).
 * 5xx, 429 and network errors are retried with exponential backoff. Other 4xx are not: the
 * receiver is telling us the request itself is wrong, and repeating it will not help.
 */
export function createWebhookSender(options: SenderOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelay = options.baseDelayMs ?? 500;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;

  async function send(event: EscalationEvent): Promise<SendOutcome> {
    const body = JSON.stringify(event);
    let outcome: SendOutcome = { delivered: false, attempts: 0 };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Fresh timestamp per attempt, so a slow retry is not rejected as stale
      const timestamp = Math.floor(now() / 1000);
      outcome = { delivered: false, attempts: attempt };
      try {
        const response = await fetchImpl(options.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [ID_HEADER]: event.id,
            [TIMESTAMP_HEADER]: String(timestamp),
            [SIGNATURE_HEADER]: sign(options.secret, timestamp, body),
          },
          body,
          signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
        });
        outcome.lastStatus = response.status;
        if (response.ok) return { ...outcome, delivered: true };
        if (response.status < 500 && response.status !== 429) return outcome;
      } catch (error) {
        outcome.error = (error as Error).message;
      }
      if (attempt < maxAttempts) await sleep(baseDelay * 2 ** (attempt - 1));
    }
    return outcome;
  }

  return {
    send,
    /** Convenience: build the event for a finished chat request. */
    escalation(requestId: string, intent: string): EscalationEvent {
      return {
        id: randomUUID(),
        type: 'chat.escalated',
        createdAt: new Date(now()).toISOString(),
        requestId,
        intent,
      };
    },
  };
}

export type WebhookSender = ReturnType<typeof createWebhookSender>;
