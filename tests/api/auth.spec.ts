import type { AddressInfo } from 'net';
import type http from 'http';
import { test, expect } from '@playwright/test';
import { buildServer } from '../../mock-chat-api/server';
import { buildAgentServer } from '../../agent/server';
import { buildAgent } from '../../agent/graph';
import { fakePlanner } from '../../agent/fake-planner';
import { keyMatches } from '../../auth/api-key';

const KEY = 'test-key-0123456789abcdef';

async function start(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return `http://localhost:${(server.address() as AddressInfo).port}`;
}
const stop = (server: http.Server) => new Promise((resolve) => server.close(resolve));

const chatBody = JSON.stringify({ message: 'How do I reset my password?' });
const post = (url: string, path: string, headers: Record<string, string> = {}) =>
  fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: chatBody,
  });

test.describe('Chat service API key', () => {
  let server: http.Server;
  let url: string;

  test.beforeAll(async () => {
    server = buildServer('safe', {}, { apiKey: KEY });
    url = await start(server);
  });

  test.afterAll(async () => {
    await stop(server);
  });

  test('a request with no key is refused with 401 @critical', async () => {
    const response = await post(url, '/chat');
    expect(response.status).toBe(401);
  });

  test('a wrong key is refused with 401 @critical', async () => {
    const response = await post(url, '/chat', { 'x-api-key': 'not-the-key' });
    expect(response.status).toBe(401);
  });

  test('the key sent in the wrong header is refused', async () => {
    const response = await post(url, '/chat', { authorization: `Bearer ${KEY}` });
    expect(response.status).toBe(401);
  });

  test('the right key gets an answer', async () => {
    const response = await post(url, '/chat', { 'x-api-key': KEY });
    expect(response.status).toBe(200);
  });

  test('the health check stays open without a key', async () => {
    const response = await fetch(`${url}/health`);
    expect(response.status).toBe(200);
  });
});

test.describe('Auth is off when no key is configured', () => {
  test('a server with no key accepts requests without a header', async () => {
    const server = buildServer('safe');
    const url = await start(server);
    try {
      expect((await post(url, '/chat')).status).toBe(200);
    } finally {
      await stop(server);
    }
  });
});

test.describe('Agent service API key', () => {
  let server: http.Server;
  let url: string;

  test.beforeAll(async () => {
    server = buildAgentServer(buildAgent({ llm: fakePlanner('good') }), { apiKey: KEY });
    url = await start(server);
  });

  test.afterAll(async () => {
    await stop(server);
  });

  test('the agent refuses a request with no key before reading the body @critical', async () => {
    const response = await post(url, '/chat');
    expect(response.status).toBe(401);
  });

  test('the agent answers with the right key', async () => {
    const response = await post(url, '/chat', { 'x-api-key': KEY });
    expect(response.status).toBe(200);
  });
});

test.describe('Key comparison', () => {
  test('equal keys match and different keys do not', () => {
    expect(keyMatches(KEY, KEY)).toBe(true);
    expect(keyMatches(KEY, `${KEY}x`)).toBe(false);
    expect(keyMatches(undefined, KEY)).toBe(false);
    expect(keyMatches(['a', 'b'], KEY)).toBe(false);
  });
});
