/**
 * Fills reports/traces/spans.jsonl with realistic spans so the dashboard has something to show.
 * It replays the eval dataset through the LLM chat service and the agent using scripted models
 * (including a leaky one, so you can see guards fire). No network, no API key.   npm run demo:traces
 */
import path from 'path';
import { fakePlanner } from '../agent/fake-planner';
import { agentDataset } from '../agent/eval';
import { buildAgent } from '../agent/graph';
import { dataset } from '../ai/eval/runner';
import { fakeModel } from '../chat-service/fake-model';
import { createTracedAssistant } from '../chat-service/traced';
import { JsonlSpanExporter, initTracing } from './tracing';

async function main(): Promise<void> {
  const file = path.resolve(process.env.TRACE_FILE ?? 'reports/traces/spans.jsonl');
  const tracing = initTracing([new JsonlSpanExporter(file)]);

  const good = createTracedAssistant(fakeModel('good'));
  const leaky = createTracedAssistant(fakeModel('leaky'));
  for (const testCase of dataset) {
    await good(testCase.input);
    await leaky(testCase.input);
  }
  const agent = buildAgent({ llm: fakePlanner('good') });
  for (const testCase of agentDataset) await agent.start(testCase.input);

  await tracing.flush();
  await tracing.shutdown();
  console.log(`Spans written to ${path.relative(process.cwd(), file)}. Now run: npm run dashboard`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
