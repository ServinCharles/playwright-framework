/**
 * Finds the similarity threshold that best separates labelled "same meaning" and "different" pairs.
 * Only a person can label pairs: set "label" to "same" or "different" in semantic-calibration.json.
 * Unlabelled pairs are skipped. The script never changes thresholds.json.
 *
 *   npm run eval:semantic-calibrate                       # offline word overlap
 *   EVAL_SEMANTIC=voyage npm run eval:semantic-calibrate  # Voyage embeddings (needs VOYAGE_API_KEY)
 */
import fs from 'fs';
import path from 'path';
import { semanticScorerFromEnv } from './runner';
import { similarity } from '../semantic/similarity';

export interface LabelledPair {
  id: string;
  reference: string;
  reply: string;
  label: 'same' | 'different';
}

export interface ScoredPair extends LabelledPair {
  score: number;
}

export interface Calibration {
  threshold: number;
  accuracy: number;
  lowestSame: number;
  highestDifferent: number;
}

/** The threshold that gets the most pairs right, where a score at or above it means "same". */
export function bestThreshold(pairs: ScoredPair[]): Calibration | undefined {
  if (pairs.length === 0) return undefined;
  const same = pairs.filter((p) => p.label === 'same').map((p) => p.score);
  const different = pairs.filter((p) => p.label === 'different').map((p) => p.score);
  const candidates = [...new Set(pairs.map((p) => p.score))].sort((a, b) => a - b);
  let best: Calibration | undefined;
  for (const threshold of candidates) {
    const correct = pairs.filter((p) =>
      p.label === 'same' ? p.score >= threshold : p.score < threshold,
    ).length;
    const accuracy = correct / pairs.length;
    if (!best || accuracy > best.accuracy)
      best = {
        threshold,
        accuracy,
        lowestSame: same.length ? Math.min(...same) : NaN,
        highestDifferent: different.length ? Math.max(...different) : NaN,
      };
  }
  return best;
}

async function main(): Promise<void> {
  const file = path.join(__dirname, 'semantic-calibration.json');
  const all: Array<LabelledPair & { label: LabelledPair['label'] | null }> = JSON.parse(
    fs.readFileSync(file, 'utf-8'),
  );
  const labelled = all.filter(
    (p): p is LabelledPair => p.label === 'same' || p.label === 'different',
  );
  const skipped = all.length - labelled.length;

  const scorer = semanticScorerFromEnv();
  const scored: ScoredPair[] = [];
  for (const pair of labelled) {
    const score = scorer
      ? await scorer(pair.reply, pair.reference)
      : similarity(pair.reply, pair.reference);
    scored.push({ ...pair, score });
  }

  console.log(`Labelled pairs: ${labelled.length}, unlabelled (skipped): ${skipped}`);
  const result = bestThreshold(scored);
  if (!result) {
    console.log('Nothing to calibrate yet. A person needs to label the pairs first.');
    return;
  }
  console.log(`Lowest score for "same": ${result.lowestSame.toFixed(3)}`);
  console.log(`Highest score for "different": ${result.highestDifferent.toFixed(3)}`);
  console.log(
    `Best threshold: ${result.threshold.toFixed(3)} (accuracy ${(result.accuracy * 100).toFixed(0)}%)`,
  );
  console.log('thresholds.json is not changed. Change it in a separate PR once this is agreed.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error((error as Error).message);
    process.exit(1);
  });
}
