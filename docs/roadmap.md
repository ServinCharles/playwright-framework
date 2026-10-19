# Roadmap: from this framework to the full AI automation engineer role

| Role requirement                           | Status                        | Where                                                                |
| ------------------------------------------ | ----------------------------- | -------------------------------------------------------------------- |
| Test automation (UI, API, CI)              | Done                          | `tests/ui`, `tests/api`, `.github/workflows`, `jenkins/`             |
| LLM API usage                              | Done                          | `ai/llm/client.ts`, `ai/generator/providers.ts`                      |
| Evaluating AI output                       | Done (rules + judge)          | `ai/eval/scorers.ts`, `ai/eval/judge.ts`                             |
| LLM-as-judge with a calibration set        | Done (needs a real key)       | `ai/eval/judge.ts`, `npm run eval:calibrate`, `JUDGE=1 npm run eval` |
| Human in the loop and audit trail          | Done                          | `ai/review/`                                                         |
| Guardrail testing (injection, PII, advice) | Done                          | `ai/eval/dataset.json`, `chat-service/guards.ts`                     |
| Real LLM-backed chat service under test    | Done (stand-in model offline) | `chat-service/`, `npm run chat-service`                              |
| Agent with tools and human approval        | Done (LangGraph)              | `agent/`, `npm run agent-service`                                    |
| MCP server exposing the test tools         | Done                          | `mcp/`, `.mcp.json.example`, `npm run mcp`                           |
| Observability (traces, dashboard)          | Done (OpenTelemetry)          | `observability/`, `npm run demo:traces`, `npm run dashboard`         |
| Webhooks (signed, retried, idempotent)     | Done                          | `webhooks/`, `tests/api/webhook-and-stream.spec.ts`                  |
| Event streaming (SSE)                      | Done                          | `mock-chat-api/server.ts` (`/chat/stream`)                           |
| Container image                            | Written, CI builds it         | `Dockerfile`                                                         |
| AWS deployment with Terraform              | Written, **never applied**    | `infra/`                                                             |

## Still not done (be honest about these in an interview)

- Nothing here has been run against a live LLM. Every test uses a scripted model. Set `ANTHROPIC_API_KEY`,
  run `npm run eval:calibrate`, then `JUDGE=1 npm run eval` and `CHAT_API_URL=... npm run eval` to find out how a
  real model behaves.
- Terraform has not been applied to a real AWS account, and the Docker image has only been built in CI.
- UI tests have not run against the real SauceDemo site from the build environment.
- Langfuse is not integrated. Traces are OpenTelemetry, so any OTLP backend (including Langfuse, Jaeger, Grafana
  Tempo) can take them via `OTEL_EXPORTER_OTLP_ENDPOINT`.
- No authentication in front of the services.
