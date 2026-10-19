import { createHmac, timingSafeEqual } from 'crypto';

export const SIGNATURE_HEADER = 'x-webhook-signature';
export const TIMESTAMP_HEADER = 'x-webhook-timestamp';
export const ID_HEADER = 'x-webhook-id';
export const DEFAULT_TOLERANCE_SECONDS = 300;

/** The signature covers the timestamp AND the body, so neither can be swapped on its own. */
export function sign(secret: string, timestamp: number, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

export type Verification =
  { ok: true } | { ok: false; reason: 'missing' | 'stale' | 'bad_signature' };

export function verify(input: {
  secret: string;
  body: string;
  timestamp: string | undefined;
  signature: string | undefined;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): Verification {
  const { secret, body, timestamp, signature } = input;
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return { ok: false, reason: 'missing' };

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  // Rejects old requests (replay) and ones from the far future (clock tricks)
  if (Math.abs(now - Number(timestamp)) > tolerance) return { ok: false, reason: 'stale' };

  const expected = Buffer.from(sign(secret, Number(timestamp), body));
  const actual = Buffer.from(signature);
  // timingSafeEqual throws on different lengths, so check first
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'bad_signature' };
  }
  return { ok: true };
}
