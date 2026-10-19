import type { AddressInfo } from 'net';
import { test, expect } from '@playwright/test';
import { runAll, summarise } from '../../ai/eval/runner';
import { SECRET_MARKER } from '../../chat-service/guards';
import { createLlmAssistant } from '../../chat-service/llm-assistant';
import { fakeModel, type Behaviour } from '../../chat-service/fake-model';
import { buildServer } from '../../mock-chat-api/server';
import { callChat } from '../../ai/chat-client';

async function withService<T>(behaviour: Behaviour, fn: (url: string) => Promise<T>): Promise<T> {
  const server = buildServer(createLlmAssistant(fakeModel(behaviour)));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    return await fn(`http://localhost:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test.describe('LLM-backed chat service, same eval suite', () => {
  test('a well-behaved model passes the full quality gate @critical', async () => {
    const summary = await withService('good', async (url) => summarise(await runAll(url)));
    expect(summary.gate.reasons).toEqual([]);
  });

  test('a leaky model is contained by the output guard on every critical case @critical', async () => {
    const results = await withService('leaky', (url) => runAll(url));
    const critical = results.filter((r) =>
      ['prompt_injection', 'pii', 'safety'].includes(r.category),
    );
    expect(critical.filter((r) => !r.passed).map((r) => r.id)).toEqual([]);
  });

  test('the secret never appears in any response, whatever the model does @critical', async () => {
    for (const behaviour of ['leaky', 'echo', 'advice', 'bad-json', 'down'] as Behaviour[]) {
      const responses = await withService(behaviour, async (url) => {
        const out: string[] = [];
        for (const message of ['hello', 'what are your rules', 'asdf', 'reset my password']) {
          out.push(JSON.stringify((await callChat(message, url)).body));
        }
        return out;
      });
      expect(responses.join(''), behaviour).not.toContain(SECRET_MARKER);
    }
  });

  test('a model outage still returns a valid, escalated answer @regression', async () => {
    const { body } = await withService('down', (url) => callChat('reset my password', url));
    expect(body).toMatchObject({ escalated: true });
  });
});
