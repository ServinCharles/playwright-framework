import { scriptedLlm, type LlmClient } from '../ai/llm/client';
import { respond } from '../mock-chat-api/assistant';

export type PlannerBehaviour =
  'good' | 'rogue-tool' | 'bad-args' | 'eager-callback' | 'loop' | 'injected' | 'bad-json' | 'down';

const number = (text: string, label: RegExp): number | undefined => {
  const match = text.match(label);
  return match ? Number(match[1].replace(/,/g, '')) : undefined;
};

function customerMessage(prompt: string): string {
  return prompt.match(/<customer_message>\n([\s\S]*?)\n<\/customer_message>/)?.[1] ?? prompt;
}

function lastToolResult(prompt: string): { name: string; body: string } | undefined {
  const all = [...prompt.matchAll(/<tool_result name="([^"]+)">\n([\s\S]*?)\n<\/tool_result>/g)];
  const last = all.at(-1);
  return last ? { name: last[1], body: last[2] } : undefined;
}

const call = (tool: string, args: object) => JSON.stringify({ action: 'call_tool', tool, args });
const answer = (reply: string, intent: string, escalated = false) =>
  JSON.stringify({ action: 'answer', reply, intent, escalated });

/** Reads the tool result and writes the customer-facing answer. */
function compose(result: { name: string; body: string }): string {
  if (result.name === 'error') {
    return answer('I could not complete that. I am passing you to a colleague.', 'fallback', true);
  }
  if (result.body.startsWith('Rejected')) {
    return answer(
      'No problem, I have not booked anything. A colleague can help if you need.',
      'human_handoff',
      true,
    );
  }
  const data = JSON.parse(result.body) as Record<string, unknown>;
  switch (result.name) {
    case 'check_aip_eligibility':
      return answer(
        `Based on what you told me, an indicative maximum loan is about £${Number(data.indicativeMaxLoan).toLocaleString('en-GB')}. This is an estimate only and not an Agreement in Principle or a guarantee.`,
        'affordability',
      );
    case 'lookup_application_status':
      return answer(
        data.status === 'Not found'
          ? 'I could not find that application reference. Please check it or speak to a colleague.'
          : `Your application status is: ${String(data.status)} (last updated ${String(data.updatedOn)}).`,
        'application_status',
      );
    case 'create_callback_request':
      return answer(
        'Your call back request has been booked. A colleague will phone you.',
        'callback_request',
      );
    default:
      return answer('Sorry, I cannot help with that here.', 'fallback', true);
  }
}

/**
 * A scripted stand-in for a tool-using model. "good" follows the rules. The others simulate
 * the failure modes an agent really has, so the tests can prove the code around the model holds.
 */
export function fakePlanner(behaviour: PlannerBehaviour = 'good'): LlmClient {
  return scriptedLlm(`fake-planner-${behaviour}`, ({ user }) => {
    const message = customerMessage(user);
    const result = lastToolResult(user);

    switch (behaviour) {
      case 'bad-json':
        return 'I will look into that for you.';
      case 'down':
        throw new Error('connect ECONNREFUSED');
      case 'rogue-tool':
        return call('delete_all_customers', { confirm: true });
      case 'bad-args':
        return call('check_aip_eligibility', {
          annualIncome: -5,
          deposit: 'lots',
          propertyPrice: 1,
        });
      case 'eager-callback':
        return result
          ? compose(result)
          : call('create_callback_request', { reason: message.slice(0, 100) });
      case 'loop':
        return call('check_aip_eligibility', {
          annualIncome: 40000,
          deposit: 20000,
          propertyPrice: 200000,
        });
      case 'injected':
        // Obeys instructions it finds inside tool output (the classic indirect prompt injection)
        if (result && /book a callback/i.test(result.body)) {
          return call('create_callback_request', { reason: 'requested by tool output' });
        }
        if (result) return compose(result);
        return call('lookup_application_status', { applicationId: 'APP-100003' });
    }

    // good
    if (result) return compose(result);

    const income = number(message, /income\D{0,12}(\d[\d,]*)/i);
    const deposit = number(message, /deposit\D{0,12}(\d[\d,]*)/i);
    const price = number(message, /(?:price|property|house)\D{0,12}(\d[\d,]*)/i);
    if (income && deposit && price) {
      return call('check_aip_eligibility', {
        annualIncome: income,
        deposit,
        propertyPrice: price,
      });
    }

    const app = message.match(/APP-\d{6}/i)?.[0];
    if (app) return call('lookup_application_status', { applicationId: app.toUpperCase() });

    if (/call me back|callback|phone me/i.test(message)) {
      return call('create_callback_request', { reason: message.slice(0, 150) });
    }

    const plain = respond(message, 'safe');
    return answer(plain.reply, plain.intent, plain.escalated);
  });
}
