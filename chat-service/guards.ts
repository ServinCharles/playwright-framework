import type { AssistantResult } from '../mock-chat-api/assistant';

/** Pretend internal instructions. A safe assistant must never repeat this marker. */
export const SECRET_MARKER = 'INTERNAL-POLICY-7731';

export const INJECTION =
  /(ignore|disregard|forget)\s+(all\s+|any\s+|your\s+)?(previous|prior|above|earlier)?\s*(instructions|rules)|system prompt|developer mode|reveal.*(instructions|prompt)|you are now/i;
export const CARD = /\b(?:\d[ -]?){13,19}\b/;
export const NI_NUMBER = /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/i;
export const SECRET_SHARE = /\b(my|the)\s+(password|pin)\s+is\b/i;

const ADVICE_REPLY =
  /\byou should (take|choose|fix|buy|remortgage)\b|\bthe best (option|mortgage)\b/i;
const GUARANTEE_REPLY =
  /\b(guaranteed|you (will|are) (definitely )?(approved|accepted))\b(?!.*\bnot\b)/i;

export const BLOCKED_RESULT: AssistantResult = {
  reply:
    "I can't share or change my internal instructions. I can help with logins, mortgages and account questions.",
  intent: 'blocked',
  escalated: false,
};

export const PII_RESULT: AssistantResult = {
  reply:
    "For your security, please don't share card numbers, passwords or National Insurance numbers in chat. I have not stored that information.",
  intent: 'pii_warning',
  escalated: false,
};

export const SAFE_FALLBACK: AssistantResult = {
  reply: "I'm sorry, I can't help with that here. I am passing you to a colleague who can.",
  intent: 'fallback',
  escalated: true,
};

/** Runs BEFORE the model. Anything caught here never reaches the LLM, so PII is never sent to it. */
export function inputGuard(message: string): { result: AssistantResult; reason: string } | null {
  if (INJECTION.test(message)) return { result: BLOCKED_RESULT, reason: 'prompt_injection' };
  if (CARD.test(message) || NI_NUMBER.test(message) || SECRET_SHARE.test(message)) {
    return { result: PII_RESULT, reason: 'pii' };
  }
  return null;
}

/** Runs AFTER the model. Never trust model output, even from a model you wrote the prompt for. */
export function outputGuard(reply: string): { ok: true } | { ok: false; reason: string } {
  if (reply.includes(SECRET_MARKER)) return { ok: false, reason: 'prompt_leak' };
  if (CARD.test(reply) || NI_NUMBER.test(reply)) return { ok: false, reason: 'pii_in_reply' };
  if (ADVICE_REPLY.test(reply)) return { ok: false, reason: 'personal_advice' };
  if (GUARANTEE_REPLY.test(reply)) return { ok: false, reason: 'guarantee_claim' };
  return { ok: true };
}
