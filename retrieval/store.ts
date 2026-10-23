import { bagOfWords, cosine, type Embedder } from '../ai/semantic/similarity';

export interface Chunk {
  docId: string;
  text: string;
  vector: Map<string, number>;
  /** True when the text reads like an instruction to the assistant rather than customer content. */
  suspicious: boolean;
}

export interface Hit {
  docId: string;
  text: string;
  score: number;
  suspicious: boolean;
}

// Phrases that try to change the assistant's behaviour. Retrieved text is data, so these are
// flagged for review rather than followed. Kept deliberately simple and easy to read.
const INSTRUCTION_PATTERNS = [
  /ignore (all |any )?(previous|prior|above) (instructions|rules)/i,
  /you are now/i,
  /\bsystem prompt\b/i,
  /\breveal\b.*\b(instructions|policy|prompt)\b/i,
  /\bdeveloper mode\b/i,
];

export function looksLikeInstruction(text: string): boolean {
  return INSTRUCTION_PATTERNS.some((p) => p.test(text));
}

/** Split a document into chunks at blank lines, keeping each heading with its text. */
export function chunk(docId: string, markdown: string): { docId: string; text: string }[] {
  return markdown
    .split(/\n\s*\n/)
    .map((block) => block.replace(/^#+\s*/gm, '').trim())
    .filter((block) => block.length > 0)
    .map((text) => ({ docId, text }));
}

export class KnowledgeStore {
  private chunks: Chunk[] = [];

  constructor(private readonly embed: Embedder = bagOfWords) {}

  add(docId: string, markdown: string): void {
    for (const piece of chunk(docId, markdown)) {
      this.chunks.push({
        ...piece,
        vector: this.embed(piece.text),
        suspicious: looksLikeInstruction(piece.text),
      });
    }
  }

  get size(): number {
    return this.chunks.length;
  }

  search(query: string, k = 3): Hit[] {
    const q = this.embed(query);
    return this.chunks
      .map((c) => ({
        docId: c.docId,
        text: c.text,
        suspicious: c.suspicious,
        score: cosine(q, c.vector),
      }))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

export type Answer =
  { abstain: true; reason: string } | { abstain: false; sources: string[]; passages: string[] };

/**
 * Answer only from the knowledge base. If nothing relevant is found, abstain instead of
 * guessing, and never use a passage flagged as suspicious as the answer.
 */
export function answerFrom(store: KnowledgeStore, question: string, minScore = 0.2): Answer {
  const usable = store.search(question, 5).filter((h) => !h.suspicious && h.score >= minScore);
  if (usable.length === 0) {
    return { abstain: true, reason: 'no relevant customer information found' };
  }
  return {
    abstain: false,
    sources: [...new Set(usable.map((h) => h.docId))],
    passages: usable.slice(0, 2).map((h) => h.text),
  };
}
