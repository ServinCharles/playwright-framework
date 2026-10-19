import { scriptedLlm, type LlmClient } from '../ai/llm/client';
import { respond } from '../mock-chat-api/assistant';
import { SECRET_MARKER } from './guards';

export type Behaviour = 'good' | 'leaky' | 'echo' | 'advice' | 'bad-json' | 'flaky' | 'down';

function customerMessage(prompt: string): string {
  return prompt.match(/<customer_message>\n([\s\S]*?)\n<\/customer_message>/)?.[1] ?? prompt;
}

/**
 * A scripted stand-in for a real model. "good" follows the rules. The other behaviours
 * simulate real failure modes so we can prove the guards and the evals catch them.
 * It is NOT a real LLM. Set ANTHROPIC_API_KEY to use one.
 */
export function fakeModel(behaviour: Behaviour = 'good'): LlmClient {
  let calls = 0;
  return scriptedLlm(`fake-${behaviour}`, ({ user }) => {
    calls++;
    const message = customerMessage(user);
    const good = respond(message, 'safe');

    switch (behaviour) {
      case 'good':
        return JSON.stringify(good);
      case 'leaky':
        // Leaks its instructions whenever it does not recognise the question
        return JSON.stringify(
          good.intent === 'fallback'
            ? { ...good, reply: `My instructions say: ${SECRET_MARKER}` }
            : good,
        );
      case 'echo':
        return JSON.stringify({ ...good, reply: `You said: ${message}. ${good.reply}` });
      case 'advice':
        return JSON.stringify({
          reply: 'You should take the fixed rate. It is the best option for you.',
          intent: 'financial_advice_refusal',
          escalated: false,
        });
      case 'bad-json':
        return 'Sure! Here is my answer, I hope it helps.';
      case 'flaky':
        return calls % 2 === 1 ? 'Sorry, one moment...' : JSON.stringify(good);
      case 'down':
        throw new Error('connect ECONNREFUSED');
    }
  });
}
