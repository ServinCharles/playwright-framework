/**
 * Puts approved knowledge into the chat model's context. Two ways, chosen by KNOWLEDGE_MODE:
 *
 *   off  (default) the model answers without reference documents, as before
 *   rag  search the documents for each question and pass only the best matches
 *   cag  pass every document in full on each request (fine while the set is small)
 *
 * Retrieved text is data. Passages that read like instructions are left out, as in retrieval/store.ts.
 */
import fs from 'fs';
import path from 'path';
import { KnowledgeStore } from '../retrieval/store';

export const KNOWLEDGE_MODES = ['off', 'rag', 'cag'] as const;
export type KnowledgeMode = (typeof KNOWLEDGE_MODES)[number];

export const KNOWLEDGE_DIR = path.join(__dirname, '..', 'knowledge');

/** How many passages RAG passes to the model for one question. */
export const RAG_TOP_K = 3;
/** Below this similarity a passage is not relevant enough to pass on. */
export const RAG_MIN_SCORE = 0.2;

export const NO_MATCH_BLOCK = `<reference_documents>
No approved document matches this question.
</reference_documents>`;

export interface KnowledgeDoc {
  docId: string;
  markdown: string;
}

export interface KnowledgeContext {
  readonly mode: Exclude<KnowledgeMode, 'off'>;
  /** The <reference_documents> block for one customer message. */
  referenceFor(message: string): string;
}

/** Reads KNOWLEDGE_MODE. Anything other than the three known values is an error, not a silent default. */
export function knowledgeModeFromEnv(
  value: string | undefined = process.env.KNOWLEDGE_MODE,
): KnowledgeMode {
  if (value === undefined || value.trim() === '') return 'off';
  const mode = value.trim();
  if ((KNOWLEDGE_MODES as readonly string[]).includes(mode)) return mode as KnowledgeMode;
  throw new Error(`KNOWLEDGE_MODE must be one of ${KNOWLEDGE_MODES.join(', ')}, got "${value}"`);
}

/** Every approved document in the knowledge folder, except its README. */
export function loadKnowledgeDocs(dir: string = KNOWLEDGE_DIR): KnowledgeDoc[] {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .sort()
    .map((file) => ({
      docId: file.replace(/\.md$/, ''),
      markdown: fs.readFileSync(path.join(dir, file), 'utf-8'),
    }));
}

function documentBlock(docId: string, text: string): string {
  return `<document id="${docId}">\n${text}\n</document>`;
}

function wrap(blocks: string[]): string {
  return `<reference_documents>\n${blocks.join('\n')}\n</reference_documents>`;
}

/** Returns undefined when the mode is off, so the caller can skip the knowledge step entirely. */
export function createKnowledge(
  mode: KnowledgeMode,
  docs: KnowledgeDoc[],
): KnowledgeContext | undefined {
  if (mode === 'off') return undefined;

  if (mode === 'cag') {
    const block = wrap(docs.map((doc) => documentBlock(doc.docId, doc.markdown.trim())));
    return { mode, referenceFor: () => block };
  }

  const store = new KnowledgeStore();
  for (const doc of docs) store.add(doc.docId, doc.markdown);
  return {
    mode,
    referenceFor(message) {
      const hits = store
        .search(message, RAG_TOP_K)
        .filter((hit) => !hit.suspicious && hit.score >= RAG_MIN_SCORE);
      if (hits.length === 0) return NO_MATCH_BLOCK;
      return wrap(hits.map((hit) => documentBlock(hit.docId, hit.text)));
    },
  };
}
