import { USER_STATES, type Intent, type UserState } from '../ai/contract';

/** Used when a request does not say who is asking. Pre-login is the most restrictive state. */
export const DEFAULT_USER_STATE: UserState = 'pre_login';

export type IntentPolicy = Record<Intent, readonly UserState[]>;

/**
 * Which user states may receive each intent. Every intent must have an entry (a unit test checks this),
 * so a new intent cannot skip the policy. An account-only intent goes to ['post_login'] only.
 * Today every intent is general information, so every state is allowed.
 */
export const INTENT_POLICY: IntentPolicy = {
  password_reset: USER_STATES,
  username_recovery: USER_STATES,
  aip_info: USER_STATES,
  affordability: USER_STATES,
  financial_advice_refusal: USER_STATES,
  human_handoff: USER_STATES,
  blocked: USER_STATES,
  pii_warning: USER_STATES,
  fallback: USER_STATES,
};

/** True when the policy lists this state for the intent. Unknown intents are denied. */
export function isActionAllowed(
  intent: Intent,
  state: UserState,
  policy: IntentPolicy = INTENT_POLICY,
): boolean {
  return policy[intent]?.includes(state) ?? false;
}
