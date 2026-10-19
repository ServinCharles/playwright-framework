import { test, expect } from '@playwright/test';
import { ChatResponseSchema, ErrorResponseSchema, INTENTS } from '../../ai/contract';
import { env } from '../../utils/env';

const chat = `${env.chatApiUrl}/chat`;

test.describe('Chat API contract', () => {
  test('health endpoint is up @smoke', async ({ request }) => {
    const response = await request.get(`${env.chatApiUrl}/health`);
    expect(response.status()).toBe(200);
    expect((await response.json()).status).toBe('ok');
  });

  test('valid message returns a response that matches the contract @smoke', async ({ request }) => {
    const response = await request.post(chat, { data: { message: 'I forgot my password' } });
    expect(response.status()).toBe(200);

    const body = ChatResponseSchema.parse(await response.json());
    expect(INTENTS).toContain(body.intent);
    expect(response.headers()['x-request-id']).toBe(body.requestId);
  });

  test('every response gets a unique request id @regression', async ({ request }) => {
    const first = await request.post(chat, { data: { message: 'hello' } });
    const second = await request.post(chat, { data: { message: 'hello' } });
    expect((await first.json()).requestId).not.toBe((await second.json()).requestId);
  });

  test('empty message is rejected with 400 @regression', async ({ request }) => {
    const response = await request.post(chat, { data: { message: '' } });
    expect(response.status()).toBe(400);
    ErrorResponseSchema.parse(await response.json());
  });

  test('missing message field is rejected with 400 @regression', async ({ request }) => {
    const response = await request.post(chat, { data: { text: 'wrong field' } });
    expect(response.status()).toBe(400);
  });

  test('message over 2000 characters is rejected with 400 @regression', async ({ request }) => {
    const response = await request.post(chat, { data: { message: 'a'.repeat(2001) } });
    expect(response.status()).toBe(400);
  });

  test('invalid JSON is rejected with 400 @regression', async ({ request }) => {
    const response = await request.post(chat, {
      headers: { 'content-type': 'application/json' },
      data: '{not json',
    });
    expect(response.status()).toBe(400);
  });

  test('wrong HTTP method returns 405 @regression', async ({ request }) => {
    const response = await request.get(chat);
    expect(response.status()).toBe(405);
    expect(response.headers()['allow']).toBe('POST');
  });

  test('unknown path returns 404 @regression', async ({ request }) => {
    const response = await request.get(`${env.chatApiUrl}/nope`);
    expect(response.status()).toBe(404);
  });

  test('response time stays under 500ms @regression', async ({ request }) => {
    const started = Date.now();
    await request.post(chat, { data: { message: 'How much can I borrow?' } });
    expect(Date.now() - started).toBeLessThan(500);
  });
});
