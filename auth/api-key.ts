import { timingSafeEqual } from 'crypto';

/**
 * Shared-key check for the services. The key is set with SERVICE_API_KEY on the server and
 * sent as the x-api-key header by clients (CHAT_API_KEY). When no key is configured the check
 * is off, so local development and the existing tests keep working.
 *
 * This is a stopgap, not user authentication. Per-user identity, rotation and audit belong
 * in an API gateway or an identity provider in front of the service.
 */
export const API_KEY_HEADER = 'x-api-key';

/** Constant-time comparison, so a wrong key cannot be found by timing the reply. */
export function keyMatches(presented: string | string[] | undefined, expected: string): boolean {
  if (typeof presented !== 'string') return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True when the request may proceed: either no key is configured or the key matches. */
export function isAuthorised(
  headers: Record<string, string | string[] | undefined>,
  expected: string | undefined,
): boolean {
  if (!expected) return true;
  return keyMatches(headers[API_KEY_HEADER], expected);
}
