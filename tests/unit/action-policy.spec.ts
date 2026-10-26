import { test, expect } from '@playwright/test';
import { INTENTS, ChatRequestSchema, USER_STATES } from '../../ai/contract';
import { scriptedLlm } from '../../ai/llm/client';
import { createLlmAssistant } from '../../chat-service/llm-assistant';
import {
  DEFAULT_USER_STATE,
  INTENT_POLICY,
  isActionAllowed,
  type IntentPolicy,
} from '../../chat-service/action-policy';

/** A model that always proposes the same intent, so the policy is the only thing under test. */
const proposing = (intent: string) =>
  scriptedLlm('proposer', () =>
    JSON.stringify({ reply: 'Here is some general information.', intent, escalated: false }),
  );

test.describe('Intent policy table', () => {
  test('every intent has a policy entry, so no intent can skip the gate @critical', () => {
    for (const intent of INTENTS) {
      expect(INTENT_POLICY[intent], `missing policy for ${intent}`).toBeDefined();
      expect(INTENT_POLICY[intent].length).toBeGreaterThan(0);
    }
  });

  test('today every intent is general information, so both states may receive it', () => {
    for (const intent of INTENTS)
      for (const state of USER_STATES)
        expect(isActionAllowed(intent, state), `${intent} for ${state}`).toBe(true);
  });

  test('an intent restricted to post_login is denied for pre_login @critical', () => {
    const policy = { ...INTENT_POLICY, aip_info: ['post_login'] } as IntentPolicy;
    expect(isActionAllowed('aip_info', 'pre_login', policy)).toBe(false);
    expect(isActionAllowed('aip_info', 'post_login', policy)).toBe(true);
  });

  test('an intent missing from the policy is denied, not allowed by default', () => {
    const policy = { ...INTENT_POLICY } as Partial<IntentPolicy>;
    delete policy.fallback;
    expect(isActionAllowed('fallback', 'post_login', policy as IntentPolicy)).toBe(false);
  });
});

test.describe('Auth state on the chat request', () => {
  test('authState accepts only the known states', () => {
    expect(ChatRequestSchema.safeParse({ message: 'hi', authState: 'post_login' }).success).toBe(
      true,
    );
    expect(ChatRequestSchema.safeParse({ message: 'hi', authState: 'admin' }).success).toBe(false);
  });

  test('authState is optional, so existing clients keep working', () => {
    expect(ChatRequestSchema.safeParse({ message: 'hi' }).success).toBe(true);
  });

  test('a missing state defaults to the most restrictive one', () => {
    expect(DEFAULT_USER_STATE).toBe('pre_login');
  });
});

test.describe('Gate inside the assistant @critical', () => {
  const restricted = { ...INTENT_POLICY, aip_info: ['post_login'] } as IntentPolicy;

  test('a pre-login user asking for a post-login intent is denied and handed off', async () => {
    const out = await createLlmAssistant(proposing('aip_info'), { policy: restricted })(
      'Tell me about AIP',
      'pre_login',
    );
    expect(out.trace?.guard).toBe('action_denied');
    expect(out.escalated).toBe(true);
    expect(out.intent).toBe('fallback');
    expect(out.reply).not.toContain('general information');
  });

  test('the same intent is allowed for a post-login user', async () => {
    const out = await createLlmAssistant(proposing('aip_info'), { policy: restricted })(
      'Tell me about AIP',
      'post_login',
    );
    expect(out.trace?.guard).toBeUndefined();
    expect(out.intent).toBe('aip_info');
  });

  test('a request with no state is treated as pre-login', async () => {
    const out = await createLlmAssistant(proposing('aip_info'), { policy: restricted })(
      'Tell me about AIP',
    );
    expect(out.trace?.guard).toBe('action_denied');
  });

  test('the model is still called once, because the gate runs on its proposal', async () => {
    const out = await createLlmAssistant(proposing('aip_info'), { policy: restricted })(
      'Tell me about AIP',
      'pre_login',
    );
    expect(out.trace?.llmCalls).toBe(1);
  });
});
