# Playwright AI Test Framework

TypeScript test framework that covers UI, API, and AI quality in one repo.

- **UI tests** with Playwright and the Page Object Model (SauceDemo as the demo app)
- **API contract tests** for a chat service, with schema checks using zod
- **AI evaluation**: a golden dataset, scorers, and a pass/fail quality gate for a chatbot
- **AI test generator**: drafts Playwright specs from plain-English requirements, with a human review gate and audit log
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
ai/contract.ts    Chat API contract (zod schemas)
ai/eval/          Dataset, scorers, thresholds, runner and CLI
ai/generator/     Prompt, providers (Anthropic, mock), validator, CLI
ai/review/        Promote/reject drafts, audit log, stats
requirements/     Plain-English inputs for the generator
jenkins/          Jenkinsfile
.github/          CI workflow and PR template
```

## How the AI parts work

**Evaluation.** `ai/eval/dataset.json` holds 28 cases in six categories: functional, safety, prompt injection, PII, escalation and robustness. Each case lists what the answer must and must not contain. `ai/eval/thresholds.json` sets the gate: 90% overall, 100% on safety, prompt injection and PII, and p95 latency under 500ms. `npm run eval` exits with an error if the gate fails, so CI blocks the release. `tests/unit/eval-has-teeth.spec.ts` proves the suite catches a deliberately broken assistant (`CHAT_API_MODE=buggy`).

**Generation with a review gate.** `npm run ai:generate` turns a requirement into a draft in `ai-generated/`, which git and CI ignore. A validator rejects drafts with no assertions, fixed waits, hardcoded URLs or credentials. A person then runs `ai:promote` with their name. The decision is logged in `ai/review-log.csv`, and `ai:stats` reports the acceptance rate. By default the generator uses the `mock` provider. Set `ANTHROPIC_API_KEY` to use a real model.

**Point it at a real chatbot.** Set `CHAT_API_URL` to any service that follows `ai/contract.ts` and the same API tests and evals run against it.

## Configuration

Copy `.env.example` to `.env`. Never commit `.env`. Key variables: `BASE_URL`, `CHAT_API_URL`, `execution` (`local` or `cloud`), `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY`, `ANTHROPIC_API_KEY`.

BrowserStack: `execution=cloud npx playwright test --project=bs-chrome`. Check BrowserStack's current Playwright docs for supported OS and browser values (`utils/bs-caps.ts`).

Extra local browsers: `ALL_BROWSERS=1 npx playwright test --project=ui-firefox`.

## Honest limitations

- The chat API is a rule-based mock. It proves the framework, not a real LLM. Swap in a real service via `CHAT_API_URL`.
- Scoring is rule-based. An LLM-as-judge scorer is on the roadmap (`docs/roadmap.md`).
- SauceDemo selectors rely on its `data-test` attributes. If the site changes, update `pages/`.
- The BrowserStack setup has not been run in this repo yet.

See `AGENTS.md` for rules AI agents must follow here and `docs/roadmap.md` for what is next.
