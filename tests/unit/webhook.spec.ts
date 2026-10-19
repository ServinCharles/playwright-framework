import { test, expect } from '@playwright/test';
import { createWebhookSender, type EscalationEvent } from '../../webhooks/sender';
import { sign, verify } from '../../webhooks/sign';

const secret = 'test-secret-123';
const body = '{"id":"1"}';
const now = 1_800_000_000;

test.describe('Webhook signature', () => {
  test('a correct signature verifies @smoke', () => {
    const signature = sign(secret, now, body);
    expect(verify({ secret, body, timestamp: String(now), signature, nowSeconds: now })).toEqual({
      ok: true,
    });
  });

  test('a changed body, secret or timestamp fails @critical', () => {
    const signature = sign(secret, now, body);
    const base = { secret, body, timestamp: String(now), signature, nowSeconds: now };
    expect(verify({ ...base, body: '{"id":"2"}' })).toMatchObject({ reason: 'bad_signature' });
    expect(verify({ ...base, secret: 'other' })).toMatchObject({ reason: 'bad_signature' });
    expect(verify({ ...base, timestamp: String(now + 1) })).toMatchObject({
      reason: 'bad_signature',
    });
  });

  test('an old request is rejected as a replay @critical', () => {
    const signature = sign(secret, now, body);
    const old = verify({ secret, body, timestamp: String(now), signature, nowSeconds: now + 301 });
    expect(old).toEqual({ ok: false, reason: 'stale' });
    const future = verify({
      secret,
      body,
      timestamp: String(now),
      signature,
      nowSeconds: now - 301,
    });
    expect(future).toEqual({ ok: false, reason: 'stale' });
  });

  test('missing or malformed headers fail without throwing', () => {
    expect(verify({ secret, body, timestamp: undefined, signature: 'x' })).toMatchObject({
      reason: 'missing',
    });
    expect(verify({ secret, body, timestamp: 'abc', signature: 'x' })).toMatchObject({
      reason: 'missing',
    });
    // A signature of the wrong length must not crash the timing-safe compare
    expect(
      verify({ secret, body, timestamp: String(now), signature: 'short', nowSeconds: now }),
    ).toMatchObject({ reason: 'bad_signature' });
  });
});

const event: EscalationEvent = {
  id: 'evt-1',
  type: 'chat.escalated',
  createdAt: '2026-01-01T00:00:00Z',
  requestId: 'req-12345678',
  intent: 'human_handoff',
};

function senderWith(responses: (number | Error)[]) {
  const calls: { headers: Record<string, string>; body: string }[] = [];
  const sleeps: number[] = [];
  const queue = [...responses];
  const sender = createWebhookSender({
    url: 'http://receiver.test/hook',
    secret,
    baseDelayMs: 100,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    fetchImpl: async (_url, init) => {
      calls.push({ headers: init?.headers as Record<string, string>, body: String(init?.body) });
      const next = queue.shift() ?? 200;
      if (next instanceof Error) throw next;
      return new Response('{}', { status: next });
    },
  });
  return { sender, calls, sleeps };
}

test.describe('Webhook sender', () => {
  test('delivers a signed request on the first try @smoke', async () => {
    const { sender, calls } = senderWith([200]);
    const outcome = await sender.send(event);
    expect(outcome).toMatchObject({ delivered: true, attempts: 1 });
    const h = calls[0].headers;
    expect(h['x-webhook-id']).toBe('evt-1');
    expect(
      verify({
        secret,
        body: calls[0].body,
        timestamp: h['x-webhook-timestamp'],
        signature: h['x-webhook-signature'],
      }),
    ).toEqual({ ok: true });
  });

  test('retries server errors with exponential backoff and the same event id @critical', async () => {
    const { sender, calls, sleeps } = senderWith([503, 500, 200]);
    const outcome = await sender.send(event);
    expect(outcome).toMatchObject({ delivered: true, attempts: 3 });
    expect(sleeps).toEqual([100, 200]);
    expect(new Set(calls.map((c) => c.headers['x-webhook-id']))).toEqual(new Set(['evt-1']));
  });

  test('does not retry a client error', async () => {
    const { sender, calls } = senderWith([400]);
    const outcome = await sender.send(event);
    expect(outcome).toMatchObject({ delivered: false, attempts: 1, lastStatus: 400 });
    expect(calls).toHaveLength(1);
  });

  test('retries 429 and network errors, then gives up', async () => {
    const { sender, calls } = senderWith([429, new Error('ECONNRESET'), 503, 503]);
    const outcome = await sender.send(event);
    expect(outcome.delivered).toBe(false);
    expect(outcome.attempts).toBe(4);
    expect(calls).toHaveLength(4);
  });

  test('the event has no customer text field', () => {
    const { sender } = senderWith([]);
    const built = sender.escalation('req-12345678', 'human_handoff');
    expect(Object.keys(built).sort()).toEqual(['createdAt', 'id', 'intent', 'requestId', 'type']);
  });
});
