# Roadmap: from this framework to the full AI automation engineer role

| Role requirement                           | Status            | Where                                                    |
| ------------------------------------------ | ----------------- | -------------------------------------------------------- |
| Test automation (UI, API, CI)              | Done              | `tests/ui`, `tests/api`, `.github/workflows`, `jenkins/` |
| LLM API usage                              | Done (generator)  | `ai/generator/providers.ts`                              |
| Evaluating AI output                       | Done (rule-based) | `ai/eval/`                                               |
| Human in the loop and audit trail          | Done              | `ai/review/`                                             |
| Guardrail testing (injection, PII, advice) | Done              | `ai/eval/dataset.json`                                   |
| LLM-as-judge scoring                       | Next              | add a scorer next to `ai/eval/scorers.ts`                |
| Real LLM-backed chat service under test    | Next              | set `CHAT_API_URL`                                       |
| Agent with tools (LangGraph)               | Next              | new `agents/` folder                                     |
| MCP server exposing the test tools         | Next              | new `mcp/` folder                                        |
| Webhooks and event streaming tests         | Next              | new `tests/api/webhooks.spec.ts`                         |
| AWS deployment with Terraform              | Next              | new `infra/` folder                                      |
| Observability (logs, traces, dashboards)   | Next              | OpenTelemetry + a dashboard                              |

Work through the "Next" rows in order. Each one should land with tests and a README section.
