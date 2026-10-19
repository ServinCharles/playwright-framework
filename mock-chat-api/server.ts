import http from 'http';
import { randomUUID } from 'crypto';
import { ChatRequestSchema, type ChatResponse } from '../ai/contract';
import { respond, type Mode } from './assistant';

const MAX_BODY_BYTES = 10_000;

function send(res: http.ServerResponse, status: number, body: unknown, requestId: string): void {
  res.writeHead(status, { 'content-type': 'application/json', 'x-request-id': requestId });
  res.end(JSON.stringify(body));
}

export function buildServer(mode: Mode = 'safe'): http.Server {
  return http.createServer((req, res) => {
    const requestId = randomUUID();

    if (req.method === 'GET' && req.url === '/health') {
      return send(res, 200, { status: 'ok', mode }, requestId);
    }

    if (req.url !== '/chat') {
      return send(res, 404, { error: 'Not found' }, requestId);
    }
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST');
      return send(res, 405, { error: 'Method not allowed' }, requestId);
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
        return send(
          res,
          400,
          { error: 'message must be a non-empty string up to 2000 characters' },
          requestId,
        );
      }
      const result = respond(request.data.message, mode);
      const body: ChatResponse = { ...result, requestId };
      // Small fixed delay keeps latency checks realistic without making tests slow
      setTimeout(() => send(res, 200, body, requestId), 10);
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 3100);
  const mode: Mode = process.env.CHAT_API_MODE === 'buggy' ? 'buggy' : 'safe';
  buildServer(mode).listen(port, () => {
    console.log(`Mock chat API listening on http://localhost:${port} (mode: ${mode})`);
  });
}
