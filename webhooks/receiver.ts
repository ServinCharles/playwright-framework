import http from 'http';
import { ID_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER, verify } from './sign';

export interface ReceivedEvent {
  id: string;
  type: string;
  [key: string]: unknown;
}

/**
 * A small, correct webhook receiver. The tests use it, and it doubles as a reference for
 * how a real consumer should behave: verify first, then dedupe, then act.
 *
 * `failFirst` makes the first N requests return 503 so retry behaviour can be tested.
 */
export function createReceiver(options: { secret: string; failFirst?: number }) {
  const events: ReceivedEvent[] = [];
  const seen = new Set<string>();
  const requests: { status: number; id?: string }[] = [];
  let failuresLeft = options.failFirst ?? 0;

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString();
      if (raw.length > 10_000) req.destroy();
    });
    req.on('end', () => {
      const id = req.headers[ID_HEADER] as string | undefined;
      const reply = (status: number, body: object = {}): void => {
        requests.push({ status, id });
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };

      if (req.method !== 'POST') return reply(405);
      if (failuresLeft > 0) {
        failuresLeft--;
        return reply(503);
      }

      const check = verify({
        secret: options.secret,
        body: raw,
        timestamp: req.headers[TIMESTAMP_HEADER] as string | undefined,
        signature: req.headers[SIGNATURE_HEADER] as string | undefined,
      });
      if (!check.ok) return reply(401, { error: check.reason });

      let event: ReceivedEvent;
      try {
        event = JSON.parse(raw);
      } catch {
        return reply(400, { error: 'invalid json' });
      }
      // Idempotency: a repeat of an event we already handled is acknowledged, not processed twice
      if (seen.has(event.id)) return reply(200, { duplicate: true });
      seen.add(event.id);
      events.push(event);
      return reply(200, { received: true });
    });
  });

  return { server, events, requests };
}
