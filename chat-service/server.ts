/**
 * LLM-backed chat service. Uses the real Anthropic model when ANTHROPIC_API_KEY is set,
 * otherwise a scripted stand-in (clearly logged) so it still runs offline.
 *
 *   npm run chat-service
 *   CHAT_API_URL=http://localhost:3101 npm run eval     # evaluate it with the same suite
 */
import { createLlmClient } from '../ai/llm/factory';
import { fakeModel } from './fake-model';
import { initTracingFromEnv } from '../observability/tracing';
import { buildChatService } from './app';
import { createKnowledge, knowledgeModeFromEnv, loadKnowledgeDocs } from './knowledge';

if (require.main === module) {
  const real = createLlmClient();
  // A scripted stand-in must never silently serve real customers
  if (!real && process.env.NODE_ENV === 'production' && process.env.ALLOW_FAKE_MODEL !== '1') {
    throw new Error(
      'ANTHROPIC_API_KEY is missing. Refusing to start the stand-in model in production.',
    );
  }
  const llm = real ?? fakeModel('good');
  const port = Number(process.env.PORT ?? 3101);

  const tracing = initTracingFromEnv();
  const webhookUrl = process.env.WEBHOOK_URL;
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (webhookUrl && !webhookSecret)
    throw new Error('WEBHOOK_URL is set but WEBHOOK_SECRET is not.');
  const knowledgeMode = knowledgeModeFromEnv();
  const knowledge = createKnowledge(knowledgeMode, loadKnowledgeDocs());
  const { server } = buildChatService({
    llm,
    webhook: webhookUrl && webhookSecret ? { url: webhookUrl, secret: webhookSecret } : undefined,
    knowledge,
  });
  const stop = (): void => {
    server.close();
    void (tracing?.shutdown() ?? Promise.resolve()).finally(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  server.listen(port, () => {
    console.log(`Chat service on http://localhost:${port} using ${llm.name}`);
    console.log(
      tracing
        ? 'Tracing is on.'
        : 'Tracing is off (set TRACE_FILE or OTEL_EXPORTER_OTLP_ENDPOINT).',
    );
    console.log(
      webhookUrl
        ? `Escalation webhook: ${webhookUrl}`
        : 'Escalation webhook is off (set WEBHOOK_URL and WEBHOOK_SECRET).',
    );
    if (!real)
      console.log('No ANTHROPIC_API_KEY set: using a scripted stand-in model, not a real LLM.');
    console.log(
      knowledge
        ? `Knowledge mode: ${knowledge.mode} (reference documents passed to the model).`
        : 'Knowledge mode: off (set KNOWLEDGE_MODE=rag or cag to pass reference documents).',
    );
  });
}
