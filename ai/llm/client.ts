/**
 * One small interface for talking to an LLM. The chat service, the judge and (later) the
 * agent all use it, so tests can swap in a scripted model and production can use Anthropic.
 */
export interface LlmRequest {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmResponse {
  text: string;
  model: string;
  latencyMs: number;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LlmClient {
  name: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

type FetchLike = typeof fetch;

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/** Anthropic Messages API client. fetch is injectable so unit tests never use the network. */
export function anthropicClient(
  apiKey: string,
  model: string,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): LlmClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;

  return {
    name: `anthropic:${model}`,
    async complete(request) {
      const started = performance.now();
      let response: Response;
      try {
        response = await fetchImpl('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: request.maxTokens ?? 1024,
            temperature: request.temperature ?? 0,
            system: request.system,
            messages: [{ role: 'user', content: request.user }],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new LlmError(`LLM request failed: ${(error as Error).message}`);
      }

      if (!response.ok) {
        throw new LlmError(
          `Anthropic API error ${response.status}: ${await response.text()}`,
          response.status,
        );
      }

      const data = (await response.json()) as {
        content?: { type: string; text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = data.content?.find((block) => block.type === 'text')?.text;
      if (!text) throw new LlmError('Anthropic API returned no text content');

      return {
        text,
        model,
        latencyMs: performance.now() - started,
        usage:
          data.usage?.input_tokens !== undefined
            ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens ?? 0 }
            : undefined,
      };
    },
  };
}

/** Build a client from a plain function. Used for tests and offline demos. */
export function scriptedLlm(
  name: string,
  handler: (request: LlmRequest) => string | Promise<string>,
): LlmClient {
  return {
    name,
    async complete(request) {
      const started = performance.now();
      const text = await handler(request);
      return { text, model: name, latencyMs: performance.now() - started };
    },
  };
}

/** Pull the first JSON object out of model text, which may have chatter around it. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object found in model output');
  return JSON.parse(text.slice(start, end + 1));
}
