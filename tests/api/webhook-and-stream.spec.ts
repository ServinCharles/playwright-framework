import type { AddressInfo } from 'net';
import type http from 'http';
import { test, expect } from '@playwright/test';
import { buildChatService } from '../../chat-service/app';
import { fakeModel, type Behaviour } from '../../chat-service/fake-model';
import { ChatResponseSchema } from '../../ai/contract';
import { createReceiver } from '../../webhooks/receiver';
import { createWebhookSender } from '../../webhooks/sender';

const secret = 'integration-secret';

const listen = async (server: http.Server): Promise<string> => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return `http://localhost:${(server.address() as AddressInfo).port}`;
};
const close = (server: http.Server): Promise<unknown> =>
  new Promise((resolve) => server.close(resolve));

async function withStack<T>(
  options: { failFirst?: number; behaviour?: Behaviour; webhookSecret?: string },
  fn: (ctx: { chat: string; receiver: ReturnType<typeof createReceiver> }) => Promise<T>,
): Promise<T> {
  const receiver = createReceiver({ secret, failFirst: options.failFirst });
  const receiverUrl = await listen(receiver.server);
  const { server } = buildChatService({
    llm: fakeModel(options.behaviour ?? 'good'),
    webhook: {
      url: `${receiverUrl}/hook`,
      secret: options.webhookSecret ?? secret,
      baseDelayMs: 5,
      maxAttempts: 4,
    },
  });
  const chat = await listen(server);
  try {
    return await fn({ chat, receiver });
  } finally {
    await close(server);
    await close(receiver.server);
  }
}

const post = (url: string, message: string, path = '/chat') =>
  fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  });

async function waitFor(check: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
}

test.describe('Escalation webhook', () => {
  test('an escalation sends one verified event with no customer text @critical', async () => {
    await withStack({}, async ({ chat, receiver }) => {
      const message = 'I want to speak to a person about zebra-4242';
      const response = await post(chat, message);
      const body = ChatResponseSchema.parse(await response.json());
      expect(body.escalated).toBe(true);

      await waitFor(() => receiver.events.length > 0);
      expect(receiver.events).toHaveLength(1);
      expect(receiver.events[0]).toMatchObject({
        type: 'chat.escalated',
        requestId: body.requestId,
      });
      expect(JSON.stringify(receiver.events)).not.toContain('zebra-4242');
    });
  });

  test('a normal answer sends nothing', async () => {
    await withStack({}, async ({ chat, receiver }) => {
      await post(chat, 'How do I reset my password?');
      await new Promise((r) => setTimeout(r, 150));
      expect(receiver.requests).toHaveLength(0);
    });
  });

  test('a flaky receiver still gets exactly one event, after retries @critical', async () => {
    await withStack({ failFirst: 2 }, async ({ chat, receiver }) => {
      await post(chat, 'I want to speak to a person');
      await waitFor(() => receiver.events.length > 0);
      expect(receiver.events).toHaveLength(1);
      expect(receiver.requests.map((r) => r.status)).toEqual([503, 503, 200]);
      // Same id on every attempt, which is what lets a receiver dedupe
      expect(new Set(receiver.requests.map((r) => r.id)).size).toBe(1);
    });
  });

  test('a wrong secret is rejected by the receiver and not retried', async () => {
    await withStack({ webhookSecret: 'wrong' }, async ({ chat, receiver }) => {
      await post(chat, 'I want to speak to a person');
      await waitFor(() => receiver.requests.length > 0);
      await new Promise((r) => setTimeout(r, 100));
      expect(receiver.events).toHaveLength(0);
      expect(receiver.requests.map((r) => r.status)).toEqual([401]);
    });
  });

  test('the chat answer is not delayed or broken when the receiver is down @critical', async () => {
    const { server } = buildChatService({
      llm: fakeModel('good'),
      webhook: { url: 'http://localhost:1/hook', secret, baseDelayMs: 5, maxAttempts: 2 },
    });
    const chat = await listen(server);
    try {
      const started = Date.now();
      const response = await post(chat, 'I want to speak to a person');
      expect(response.status).toBe(200);
      expect(ChatResponseSchema.parse(await response.json()).escalated).toBe(true);
      expect(Date.now() - started).toBeLessThan(500);
    } finally {
      await close(server);
    }
  });

  test('a replayed event is acknowledged but processed once', async () => {
    const receiver = createReceiver({ secret });
    const url = await listen(receiver.server);
    try {
      const sender = createWebhookSender({ url: `${url}/hook`, secret });
      const event = sender.escalation('req-12345678', 'human_handoff');
      await sender.send(event);
      await sender.send(event);
      expect(receiver.events).toHaveLength(1);
      expect(receiver.requests.map((r) => r.status)).toEqual([200, 200]);
    } finally {
      await close(receiver.server);
    }
  });
});

test.describe('Streaming (SSE)', () => {
  async function readStream(url: string, message: string) {
    const response = await post(url, message, '/chat/stream');
    const text = await response.text();
    const events = text
      .trim()
      .split('\n\n')
      .map((block) => {
        const [name, data] = block.split('\n');
        return { name: name.replace('event: ', ''), data: JSON.parse(data.replace('data: ', '')) };
      });
    return { response, events };
  }

  test('tokens add up to the reply and a final event matches the contract @smoke', async () => {
    await withStack({}, async ({ chat }) => {
      const { response, events } = await readStream(chat, 'What is an agreement in principle?');
      expect(response.headers.get('content-type')).toBe('text/event-stream');
      const done = events.at(-1)!;
      expect(done.name).toBe('done');
      const body = ChatResponseSchema.parse(done.data);
      const tokens = events.filter((e) => e.name === 'token').map((e) => e.data.text);
      expect(tokens.length).toBeGreaterThan(3);
      expect(tokens.join('').trim()).toBe(body.reply.trim());
    });
  });

  test('a leaking model never streams the secret, because guards run first @critical', async () => {
    await withStack({ behaviour: 'leaky' }, async ({ chat }) => {
      const { response, events } = await readStream(chat, 'asdfghjkl');
      expect(await response.headers.get('content-type')).toContain('event-stream');
      expect(JSON.stringify(events)).not.toContain('INTERNAL-POLICY');
      expect(ChatResponseSchema.parse(events.at(-1)!.data).escalated).toBe(true);
    });
  });
});
