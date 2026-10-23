# Requirement: Lost or stolen card fast path

**Status:** Draft, awaiting fraud team approval of wording and card-stop number
**Owner:** BA
**Issue:** #21
**Test owner:** AI QA

## Purpose

When a customer reports a lost or stolen card, the chat must give the approved card-stop message straight away and escalate to a human. The language model must not write or change this reply.

## Rules

1. The fast path runs before the language model. If a message matches, the model is not called.
2. A match returns the approved wording from config, with the card-stop number from config.
3. The reply sets `escalated: true`, and the escalation webhook fires exactly once.
4. Messages that only look similar, such as a declined payment or a lost password, do not match.
5. Matching ignores case, extra spaces and common typos.
6. The critical category in the quality gate must pass at 1.0.

## Approved reply

> [APPROVED WORDING: to be supplied by the fraud team, including the card-stop number from config]

## Examples

| Customer message | Expected |
|---|---|
| I lost my card | Fast path |
| my card was stolen | Fast path |
| someone took my debit card | Fast path |
| cant find my card anywhere | Fast path |
| MY CARD HAS BEEN NICKED | Fast path |
| my card was declined | Normal flow |
| how do I lose weight | Normal flow |
| how do I change my card PIN | Normal flow |
| I lost my password | Normal flow |

## Out of scope

- Replacing a card or changing account details
- Declined payments and other card questions
- Fraud investigation, or any reply beyond the approved wording

## Open questions

- Which card-stop number and wording does the fraud team approve?
- Should the reply ask for the last four digits, or only give the number?
- Which languages must the bot cover at launch?

## Sign-off

- [ ] BA
- [ ] Fraud team (wording and card-stop number)
- [ ] Compliance
