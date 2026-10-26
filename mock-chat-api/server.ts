import http from 'http';
import { randomUUID } from 'crypto';
import { ChatRequestSchema, USER_STATES, type ChatResponse, type UserState } from '../ai/contract';
import { respond, type AssistantResult, type Mode } from './assistant';
import { isAuthorised } from '../auth/api-key';

export type Responder = (
  message: string,
  authState?: UserState,
) => AssistantResult | Promise<AssistantResult>;

const MAX_BODY_BYTES = 10_000;

function send(res: http.ServerResponse, status: number, body: unknown, requestId: string): void {
  res.writeHead(status, { 'content-type': 'application/json', 'x-request-id': requestId });
  res.end(JSON.stringify(body));
}

export interface ServerHooks {
  /** Called after a response is sent. Must never throw into the request. Used for webhooks. */
  onResult?: (info: { requestId: string; result: AssistantResult }) => void | Promise<void>;
}

/** Split a reply into small pieces for streaming. */
export function chunkReply(reply: string): string[] {
  return reply.match(/\S+\s*/g) ?? [reply];
}

/**
 * Server-sent events. The reply is already fully checked by the guards before the first
 * token goes out. Streaming raw model output would let an unsafe sentence reach the customer
 * before the output guard could see the whole answer.
 */
function stream(res: http.ServerResponse, body: ChatResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'x-request-id': body.requestId,
  });
  const event = (name: string, data: unknown): void => {
    res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  for (const text of chunkReply(body.reply)) event('token', { text });
  event('done', body);
  res.end();
}

export interface ServerOptions {
  /** When set, POST requests must send this value in the x-api-key header. */
  apiKey?: string;
}

/**
 * The 400 message for a bad chat request. Names authState when that is the field at fault,
 * so a caller is not told about the message when it was the authState that was wrong.
 */
export function requestErrorMessage(issues: { path: PropertyKey[] }[]): string {
  if (issues.some((issue) => issue.path[0] === 'authState'))
    return `authState must be one of: ${USER_STATES.join(', ')}`;
  return 'message must be a non-empty string up to 2000 characters';
}

export function buildServer(
  mode: Mode | Responder = 'safe',
  hooks: ServerHooks = {},
  options: ServerOptions = {},
): http.Server {
  const label = typeof mode === 'string' ? mode : 'custom';
  const answer: Responder =
    typeof mode === 'string' ? (m, authState) => respond(m, mode, authState) : mode;
  return http.createServer((req, res) => {
    const requestId = randomUUID();

    if (req.method === 'GET' && req.url === '/health') {
      return send(res, 200, { status: 'ok', mode: label }, requestId);
    }

    const streaming = req.url === '/chat/stream';
    if (req.url !== '/chat' && !streaming) {
      return send(res, 404, { error: 'Not found' }, requestId);
    }
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST');
      return send(res, 405, { error: 'Method not allowed' }, requestId);
    }
    if (!isAuthorised(req.headers, options.apiKey)) {
      return send(res, 401, { error: 'Missing or wrong API key' }, requestId);
    }

    let raw = '';
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString();
      if (raw.length > MAX_BODY_BYTES) {
        tooLarge = true;
        req.destroy();
      }
    });
    req.on('end', () => {
      if (tooLarge) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return send(res, 400, { error: 'Body must be valid JSON' }, requestId);
      }
      const request = ChatRequestSchema.safeParse(parsed);
      if (!request.success) {
        return send(res, 400, { error: requestErrorMessage(request.error.issues) }, requestId);
      }
      Promise.resolve(answer(request.data.message, request.data.authState))
        .then((result) => {
          const { reply, intent, escalated } = result;
          const body: ChatResponse = { reply, intent, escalated, requestId };
          // Fire-and-forget: a slow or broken webhook must never slow down or break the chat
          Promise.resolve(hooks.onResult?.({ requestId, result })).catch(() => undefined);
          if (streaming) return stream(res, body);
          // Small fixed delay keeps latency checks realistic without making tests slow
          setTimeout(() => send(res, 200, body, requestId), 10);
        })
        .catch(() => send(res, 500, { error: 'Internal error' }, requestId));
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 3100);
  const mode: Mode = process.env.CHAT_API_MODE === 'buggy' ? 'buggy' : 'safe';
  buildServer(mode, {}, { apiKey: process.env.SERVICE_API_KEY || undefined }).listen(port, () => {
    console.log(`Mock chat API listening on http://localhost:${port} (mode: ${mode})`);
  });
}
