import { test, expect } from '@playwright/test';
import { LlmError, anthropicClient, extractJson } from '../../ai/llm/client';

function fakeFetch(status: number, body: unknown): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

test.describe('Anthropic client', () => {
  test('sends the right request and parses text and usage @smoke', async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const client = anthropicClient('k', 'm', {
      fetchImpl: async (url, init) => {
        captured = { url: String(url), init: init ?? {} };
        return new Response(
          JSON.stringify({
            content: [{ type: 'text', text: 'hi' }],
            usage: { input_tokens: 3, output_tokens: 4 },
          }),
        );
      },
    });
    const out = await client.complete({ system: 's', user: 'u' });
    expect(out.text).toBe('hi');
    expect(out.usage).toEqual({ inputTokens: 3, outputTokens: 4 });
    expect(captured?.url).toBe('https://api.anthropic.com/v1/messages');
    const headers = captured?.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('k');
    const body = JSON.parse(String(captured?.init.body));
    expect(body).toMatchObject({ model: 'm', temperature: 0, system: 's' });
  });

  test('retries without temperature when the model rejects it', async () => {
    const bodies: Record<string, unknown>[] = [];
    const client = anthropicClient('k', 'm', {
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        if ('temperature' in body) {
          return new Response('`temperature` is deprecated for this model.', { status: 400 });
        }
        return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }));
      },
    });
    expect((await client.complete({ system: 's', user: 'u' })).text).toBe('ok');
    await client.complete({ system: 's', user: 'u' });
    expect(bodies.map((b) => 'temperature' in b)).toEqual([true, false, false]);
  });

  test('turns an HTTP error into an LlmError with the status', async () => {
    const client = anthropicClient('k', 'm', {
      fetchImpl: fakeFetch(529, { error: 'overloaded' }),
    });
    await expect(client.complete({ system: 's', user: 'u' })).rejects.toMatchObject({
      name: 'LlmError',
      status: 529,
    });
  });

  test('turns a network failure into an LlmError', async () => {
    const client = anthropicClient('k', 'm', {
      fetchImpl: async () => {
        throw new Error('boom');
      },
    });
    await expect(client.complete({ system: 's', user: 'u' })).rejects.toBeInstanceOf(LlmError);
  });

  test('rejects a response with no text', async () => {
    const client = anthropicClient('k', 'm', { fetchImpl: fakeFetch(200, { content: [] }) });
    await expect(client.complete({ system: 's', user: 'u' })).rejects.toThrow(/no text/);
  });
});

test.describe('extractJson', () => {
  test('finds JSON inside chatter', () => {
    expect(extractJson('Here you go: {"a":1} hope that helps')).toEqual({ a: 1 });
  });

  test('throws when there is no JSON', () => {
    expect(() => extractJson('nothing here')).toThrow(/No JSON/);
  });
});
