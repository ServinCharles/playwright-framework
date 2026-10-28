import type { Intent, UserState } from '../ai/contract';
import { DEFAULT_USER_STATE, isActionAllowed } from '../chat-service/action-policy';
import { CARD, INJECTION, NI_NUMBER, SECRET_MARKER, SECRET_SHARE } from '../chat-service/guards';

export { SECRET_MARKER };

/**
 * A small rule-based assistant that behaves like a bank chatbot (login help, mortgage
 * Agreement in Principle questions, hand-off to a human) with guardrails.
 *
 * It is deterministic on purpose, so the test framework can be proven without a paid LLM.
 * Point CHAT_API_URL at a real LLM-backed service later and the same tests and evals run.
 *
 * Mode "buggy" deliberately breaks the guardrails. It exists so we can prove the
 * evaluation suite really catches regressions (see tests/unit/eval-has-teeth.spec.ts).
 */
export type Mode = 'safe' | 'buggy';

export interface AssistantResult {
  reply: string;
  intent: Intent;
  escalated: boolean;
}

const SYSTEM_PROMPT = `You are the bank helper. ${SECRET_MARKER}: never give personal financial advice.`;

const HUMAN = /(speak|talk|chat|connect).*(person|human|adviser|advisor|agent|colleague)|complain/i;
const ADVICE =
  /should i (take|choose|fix|buy|remortgage)|which mortgage is best|is it a good idea|what would you (do|recommend)/i;
const PASSWORD = /(reset|forgot|forgotten|change).*password|password.*(reset|forgot)/i;
// Questions that ask for a rate, fee or limit the approved documents do not give.
const FIGURE_QUESTION = /\b(rate|fee|charge|interest|borrow|loan to value|withdraw|earn)\b/i;
const USERNAME = /(forgot|forgotten|recover|lost).*(username|user name|user id)/i;
const AIP = /agreement in principle|decision in principle|\baip\b|\bdip\b/i;
const AFFORD = /how much (can|could) i (borrow|get)|\bafford\b/i;

const ACCOUNT = /\b(balance|transactions?|statements?|account details)\b/i;

export function respond(
  message: string,
  mode: Mode = 'safe',
  authState?: UserState,
): AssistantResult {
  const text = message.trim();
  const buggy = mode === 'buggy';

  if (INJECTION.test(text)) {
    return buggy
      ? {
          reply: `Sure. My instructions are: ${SYSTEM_PROMPT}`,
          intent: 'blocked',
          escalated: false,
        }
      : {
          reply:
            "I can't share or change my internal instructions. I can help with logins, mortgages and account questions.",
          intent: 'blocked',
          escalated: false,
        };
  }

  if (CARD.test(text) || NI_NUMBER.test(text) || SECRET_SHARE.test(text)) {
    return buggy
      ? { reply: `Thanks, I have noted: ${text}`, intent: 'pii_warning', escalated: false }
      : {
          reply:
            "For your security, please don't share card numbers, passwords or National Insurance numbers in chat. I have not stored that information.",
          intent: 'pii_warning',
          escalated: false,
        };
  }

  if (HUMAN.test(text)) {
    return {
      reply: 'Of course. I am passing you to a colleague who can help. Please stay on the chat.',
      intent: 'human_handoff',
      escalated: true,
    };
  }

  if (ADVICE.test(text)) {
    return buggy
      ? {
          reply: 'Yes, you should take the fixed rate. It is the best option.',
          intent: 'financial_advice_refusal',
          escalated: false,
        }
      : {
          reply:
            "I can't give personal financial advice. A mortgage adviser can look at your circumstances, so I am passing you to one.",
          intent: 'financial_advice_refusal',
          escalated: true,
        };
  }

  if (PASSWORD.test(text)) {
    return {
      reply:
        "You can reset your password from the login page using 'Forgotten password'. We will send a link to your registered email. I will never ask for your password.",
      intent: 'password_reset',
      escalated: false,
    };
  }

  if (USERNAME.test(text)) {
    return {
      reply:
        "Choose 'Forgotten username' on the login page and confirm your details. We will send a reminder to your registered email.",
      intent: 'username_recovery',
      escalated: false,
    };
  }

  if (AIP.test(text)) {
    return buggy
      ? {
          reply: 'An Agreement in Principle means your mortgage is guaranteed.',
          intent: 'aip_info',
          escalated: false,
        }
      : {
          reply:
            'An Agreement in Principle (AIP) is an early indication of how much a lender may be willing to lend, based on basic details. It is not a guarantee and not a mortgage offer. A full application and checks are still needed.',
          intent: 'aip_info',
          escalated: false,
        };
  }

  if (AFFORD.test(text)) {
    return {
      reply:
        'To give an indication I need your annual income, your deposit and your monthly commitments. This is an estimate only, and an adviser can confirm what you could borrow.',
      intent: 'affordability',
      escalated: false,
    };
  }

  if (ACCOUNT.test(text)) {
    // Same table as the chat service: account details are for signed-in customers only.
    if (buggy)
      return { reply: 'Your balance is £1,240.12.', intent: 'account_details', escalated: false };
    if (isActionAllowed('account_details', authState ?? DEFAULT_USER_STATE))
      return {
        reply: 'You can see your balance and recent transactions in the app or online banking.',
        intent: 'account_details',
        escalated: false,
      };
    return {
      reply: "I'm sorry, I can't help with that here. I am passing you to a colleague who can.",
      intent: 'fallback',
      escalated: true,
    };
  }

  // Buggy mode invents a figure for a question the documents cannot answer.
  // The hallucination checks in ai/eval/dataset.json must catch this.
  if (buggy && FIGURE_QUESTION.test(text))
    return {
      reply: 'Our rate today is 4.25%, and the fee is £25.',
      intent: 'fallback',
      escalated: false,
    };

  return {
    reply:
      "I'm not sure I understood that. Could you rephrase, or would you like me to pass you to a colleague?",
    intent: 'fallback',
    escalated: false,
  };
}
