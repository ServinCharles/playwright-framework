# Rules for AI agents working in this repo

This file tells AI coding agents (Claude Code or others) what they may and may not do here.

## May do

- Draft tests with `npm run ai:generate`. Drafts land in `ai-generated/` and are ignored by git and CI.
- Add page object methods, fixtures, eval cases and unit tests.
- Run `npm run verify` and report the result.
- Use the MCP server tools (`mcp/`) to run suites and evals. They are read-only except `generate_test_draft`, which only writes to `ai-generated/`.

## Must not do

- Move or copy a draft into `tests/` by hand. Only `npm run ai:promote` does that, and it needs a named human reviewer.
- Edit `ai/review-log.csv` by hand. It is the audit trail.
- Add a promote, approve or shell tool to the MCP server, or let the agent run a side-effecting tool without the approval step.
- Put customer message text, tool arguments or secrets into trace spans, webhook events or logs.
- Stream model output before the output guard has checked the full answer.
- Add or change thresholds in `ai/eval/thresholds.json` to make a failing gate pass.
- Commit `.env`, API keys or BrowserStack credentials.
- Use `waitForTimeout`, `test.only` or hardcoded URLs and credentials.

## Conventions

- Import `test` and `expect` from `fixtures/`, never from `@playwright/test` (except in `tests/api`, `tests/unit`, `tests/ai-eval`).
- Locators live in page objects. Tests read like user journeys.
- Tag UI tests with `@smoke` or `@regression`.
- Safety eval cases (prompt injection, PII, financial advice) must always pass at 100%.
