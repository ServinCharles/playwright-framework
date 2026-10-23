/**
 * Catches questions that ask for a personal financial decision, before the model is called.
 * The model is not trusted to refuse these on its own: the output guard catches advice after
 * it is drafted, but this rule stops the draft from being written at all.
 *
 * Deliberately narrow. Affordability and eligibility questions ("could I afford...") are
 * allowed through, because the assistant is meant to answer them with rough estimates.
 */
const FINANCE =
  /\b(mortgage|rate|fixed|tracker|remortgage|deposit|savings|invest|investment|pension|overpay|loan|property|house)\b/;
const SHOULD_I = /\bshould i\b/;
const DECISION_VERB =
  /\b(fix|switch|remortgage|overpay|invest|move|sell|buy|pay off|take|choose|stay)\b/;
const TRACKER_OR_FIXED = /\b(tracker or fixed|fixed or tracker)\b/;
const WHAT_WOULD_YOU_RECOMMEND = /\bwhat (would|should) you (recommend|suggest)\b/;
const WHICH_IS_BEST =
  /\bwhich\b.*\b(mortgage|rate|product|deal|fixed|tracker|savings|account)\b.*\b(best|right|suit|suits|for me|better)\b/;
const IS_IT_BETTER =
  /\bis it (better|worth|a good idea)\b.*\b(fix|switch|remortgage|overpay|invest|buy|sell)\b/;

export function isAdviceQuestion(message: string): boolean {
  const text = message.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (
    TRACKER_OR_FIXED.test(text) ||
    WHAT_WOULD_YOU_RECOMMEND.test(text) ||
    WHICH_IS_BEST.test(text) ||
    IS_IT_BETTER.test(text)
  )
    return true;
  return SHOULD_I.test(text) && FINANCE.test(text) && DECISION_VERB.test(text);
}
