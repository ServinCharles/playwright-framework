# Playwright AI Test Framework

TypeScript test framework that covers UI, API, and AI quality in one repo.

- **UI tests** with Playwright and the Page Object Model (SauceDemo as the demo app)
- **API contract tests** for a chat service, with schema checks using zod
- **AI evaluation**: a golden dataset, scorers, and a pass/fail quality gate for a chatbot
- **AI test generator**: drafts Playwright specs from plain-English requirements, with a human review gate and audit log
- **LLM-backed chat service** with input and output guards, and an **LLM-as-judge** scorer with a calibration set
- **Agent** (LangGraph) with tools and a human approval step, evaluated with its own dataset
- **MCP server** that lets an AI assistant run the tests and evals (it cannot promote drafts)
- **Observability**: OpenTelemetry traces and a static HTML dashboard
- **Signed webhooks**, SSE streaming, a Dockerfile and Terraform for AWS (Terraform not yet applied)
- **CI**: GitHub Actions and Jenkins, BrowserStack option

## Quick start

```bash
npm install
npx playwright install chromium
cp .env.example .env          # then fill in what you need
npm run verify                # typecheck, lint, unit, API and AI eval tests, quality gate
```

`npm run verify` needs no internet access beyond npm. UI tests need the target site (default `https://www.saucedemo.com`).

## Commands

| Command                                                                                  | What it does                                         |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `npm test`                                                                               | All default projects (setup, UI, API, AI eval, unit) |
| `npm run test:smoke` / `test:regression`                                                 | Run by tag                                           |
| `npm run test:ui` / `test:api` / `test:ai-eval` / `test:unit`                            | One layer                                            |
| `npm run chat-api`                                                                       | Start the local mock chat API on port 3100           |
| `npm run eval`                                                                           | Run the golden dataset and enforce the quality gate  |
| `npm run ai:generate -- --requirement requirements/product-sorting.md`                   | Draft a spec with AI                                 |
| `npm run ai:promote -- --file ai-generated/<file> --decision accepted --reviewer "Name"` | Human review decision                                |
| `npm run ai:stats`                                                                       | Acceptance, edit and rejection rates                 |
| `npm run report`                                                                         | Open the HTML report                                 |
| `npm run chat-service`                                                                   | LLM-backed chat service on port 3101                 |
| `npm run agent-service`                                                                  | LangGraph agent service on port 3102                 |
| `npm run mcp`                                                                            | MCP server on stdio (see `.mcp.json.example`)        |
| `JUDGE=1 npm run eval`                                                                   | Also grade rubric cases with an LLM judge            |
| `npm run eval:calibrate`                                                                 | Check the judge against human labels                 |
| `npm run demo:traces` then `npm run dashboard`                                           | Fill traces with demo data, build the dashboard      |

## Folder map

```
pages/            Page objects (locators and actions)
fixtures/         Custom test() with page objects and data injected
data/             Test data (users, checkout details)
tests/ui/         UI specs (+ auth.setup.ts that saves the login session)
tests/api/        API contract tests for the chat service
tests/ai-eval/    One test per golden-dataset case, plus repeatability and the gate
tests/unit/       Tests for the framework's own code
mock-chat-api/    Deterministic bank-style chatbot (safe and buggy modes)
chat-service/     LLM chat service: guards, assistant, scripted models, traced wiring
agent/            LangGraph agent: tools, graph, scripted planner, eval, HTTP wrapper
mcp/              MCP server (tools an AI assistant may call)
observability/    OpenTelemetry setup, JSONL exporter, dashboard builder
webhooks/         Signing, sender with retries, reference receiver
infra/            Terraform for AWS (never applied) and its README
Dockerfile        Image for the chat service
ai/contract.ts    Chat API contract (zod schemas)
ai/llm/           One small LLM client interface (Anthropic and scripted)
ai/eval/          Dataset, scorers, thresholds, runner and CLI
ai/generator/     Prompt, providers (Anthropic, mock), validator, CLI
ai/review/        Promote/reject drafts, audit log, stats
requirements/     Plain-English inputs for the generator
jenkins/          Jenkinsfile
.github/          CI workflow and PR template
```

## How the AI parts work

**Evaluation.** `ai/eval/dataset.json` holds 31 cases in six categories: functional, safety, prompt injection, PII, escalation and robustness. Each case lists what the answer must and must not contain. `ai/eval/thresholds.json` sets the gate: 90% overall, 100% on safety, prompt injection and PII, and p95 latency under 500ms. `npm run eval` exits with an error if the gate fails, so CI blocks the release. `tests/unit/eval-has-teeth.spec.ts` proves the suite catches a deliberately broken assistant (`CHAT_API_MODE=buggy`).

**Generation with a review gate.** `npm run ai:generate` turns a requirement into a draft in `ai-generated/`, which git and CI ignore. A validator rejects drafts with no assertions, fixed waits, hardcoded URLs or credentials. A person then runs `ai:promote` with their name. The decision is logged in `ai/review-log.csv`, and `ai:stats` reports the acceptance rate. By default the generator uses the `mock` provider. Set `ANTHROPIC_API_KEY` to use a real model.

**LLM-backed chat service.** `chat-service/` runs `input guard -> LLM -> JSON validation (one repair) -> output guard`. Anything that fails falls back to a hand-off to a human, never to an unchecked answer. Without `ANTHROPIC_API_KEY` it uses a scripted stand-in model so it runs offline, and in production it refuses to start with the stand-in. The same eval suite runs against it in `tests/ai-eval/llm-service.spec.ts`, including a model that leaks its prompt, to prove the output guard holds.

**LLM-as-judge.** Cases with a `rubric` can be graded by a model (`JUDGE=1 npm run eval`). The model only scores 1 to 5; code decides pass or fail, temperature is 0, and unusable output fails closed. Trust it only after `npm run eval:calibrate` shows agreement with the human labels in `ai/eval/judge-calibration.json`. Rules stay first for safety cases.

**Agent.** `agent/` is a LangGraph graph: plan, act, approval. The model proposes a tool call; code checks the tool exists, validates the arguments with zod, and enforces a step limit. Tools that change data (`create_callback_request`) pause the graph until a human approves through `POST /chat/approve`. Tool results are treated as untrusted data, and a test proves instructions hidden in a tool result cannot trigger a side effect.

**MCP server.** `mcp/` exposes six tools: `run_tests` (allowlisted suites and tags only), `run_eval`, `list_eval_cases`, `get_eval_report`, `generate_test_draft` (reads only `requirements/`) and `review_stats`. There is deliberately no promote tool. Copy `.mcp.json.example` into your assistant's config.

**Observability.** Set `TRACE_FILE=reports/traces/spans.jsonl` and/or `OTEL_EXPORTER_OTLP_ENDPOINT` on a service to record spans (`chat.request`, `llm.call`, `agent.plan`, `agent.act`, `agent.approval`). Spans hold sizes, names and outcomes, never customer text. `npm run dashboard` builds `reports/dashboard/index.html` from eval history, traces and review stats.

**Webhooks and streaming.** When `WEBHOOK_URL` and `WEBHOOK_SECRET` are set, every escalation to a human sends a signed event (HMAC-SHA256 over timestamp and body, 5-minute replay window, same event id on every retry, exponential backoff). The event contains no customer text. `/chat/stream` streams the reply as server-sent events, but only after the guards have approved the whole answer.

**Point it at a real chatbot.** Set `CHAT_API_URL` to any service that follows `ai/contract.ts` and the same API tests and evals run against it.

## Configuration

Copy `.env.example` to `.env`. Never commit `.env`. Key variables: `BASE_URL`, `CHAT_API_URL`, `execution` (`local` or `cloud`), `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY`, `ANTHROPIC_API_KEY`.

BrowserStack: `execution=cloud npx playwright test --project=bs-chrome`. Check BrowserStack's current Playwright docs for supported OS and browser values (`utils/bs-caps.ts`).

Extra local browsers: `ALL_BROWSERS=1 npx playwright test --project=ui-firefox`.

## Honest limitations

- The default chat API is a rule-based mock, and the LLM service, agent and judge are tested with scripted models. Nothing has been run against a live LLM yet. Set `ANTHROPIC_API_KEY` and point `CHAT_API_URL` at `npm run chat-service` to find out how a real model behaves.
- Terraform in `infra/` has never been applied to AWS. CI validates it and builds the Docker image.
- The services have no authentication of their own. Put one in front before real use.
- SauceDemo selectors rely on its `data-test` attributes. If the site changes, update `pages/`.
- The BrowserStack setup has not been run in this repo yet.

See `AGENTS.md` for rules AI agents must follow here and `docs/roadmap.md` for what is next.
