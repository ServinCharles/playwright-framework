/**
 * Lost or stolen card detection. Runs before the model, so a report never depends on model output.
 * Typos are handled by a fixed list of known misspellings, not fuzzy matching, so every match
 * can be traced to a rule and audited.
 */
export const LOST_CARD_REPLY =
  "I'm sorry to hear your card has been lost or stolen. Please call our card-stop line on [CARD-STOP NUMBER: pending fraud team approval] straight away. I am passing you to a colleague who can help.";

const CARD_WORDS = ['card', 'cards', 'crad', 'cadr', 'carf', 'cardd'];
const LOST_WORDS = ['lost', 'lsot', 'losst'];
const STOLEN_WORDS = ['stolen', 'stollen', 'stoln'];
const OTHER_LOSS_WORDS = ['took', 'nicked', 'missing'];
const LOSS_PHRASE = /\b(cant|cannot|can not) find\b/;

export function isLostCardReport(message: string): boolean {
  const text = message
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return false;

  const words = text.split(' ');
  if (!words.some((word) => CARD_WORDS.includes(word))) return false;

  const lossWords = [...LOST_WORDS, ...STOLEN_WORDS, ...OTHER_LOSS_WORDS];
  return words.some((word) => lossWords.includes(word)) || LOSS_PHRASE.test(text);
}
