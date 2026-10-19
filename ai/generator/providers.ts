import { SAMPLE_RESPONSE } from '../fixtures/sample-response';

export interface Provider {
  name: string;
  generate(system: string, user: string): Promise<string>;
}

export const mockProvider: Provider = {
  name: 'mock',
  generate: async () => SAMPLE_RESPONSE,
};

type FetchLike = typeof fetch;

/** Calls the Anthropic Messages API. fetch is injectable so unit tests never touch the network. */
export function anthropicProvider(
  apiKey: string,
  model: string,
  fetchImpl: FetchLike = fetch,
): Provider {
  return {
    name: `anthropic:${model}`,
    async generate(system, user) {
      const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4000,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      if (!response.ok) {
        throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
      }
      const data = (await response.json()) as { content?: { type: string; text?: string }[] };
      const text = data.content?.find((block) => block.type === 'text')?.text;
      if (!text) throw new Error('Anthropic API returned no text content');
      return text;
    },
  };
}
