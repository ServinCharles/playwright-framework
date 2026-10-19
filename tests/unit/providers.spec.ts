import { test, expect } from '@playwright/test';
import { anthropicProvider, mockProvider } from '../../ai/generator/providers';
import { buildPrompt } from '../../ai/generator/prompt';

test.describe('Generator providers', () => {
  test('mock provider returns a canned draft', async () => {
    expect(await mockProvider.generate('s', 'u')).toContain('test.describe');
  });

  test('anthropic provider sends the right request and parses the reply', async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'hello' }] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const provider = anthropicProvider('test-key', 'some-model', fakeFetch);
    expect(await provider.generate('SYSTEM', 'USER')).toBe('hello');

    expect(captured?.url).toBe('https://api.anthropic.com/v1/messages');
    const headers = captured?.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(captured?.init.body as string);
    expect(body).toMatchObject({
      model: 'some-model',
      system: 'SYSTEM',
      messages: [{ role: 'user', content: 'USER' }],
    });
  });

  test('anthropic provider surfaces API errors', async () => {
    const fakeFetch = (async () =>
      new Response('rate limited', { status: 429 })) as unknown as typeof fetch;
    await expect(anthropicProvider('k', 'm', fakeFetch).generate('s', 'u')).rejects.toThrow('429');
  });

  test('prompt carries the framework rules and the requirement', () => {
    const { system, user } = buildPrompt('Users can sort products');
    expect(system).toContain("'../../fixtures'");
    expect(system).toContain('waitForTimeout');
    expect(user).toContain('Users can sort products');
  });
});
