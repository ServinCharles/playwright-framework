/**
 * Checks how often the LLM judge agrees with human labels before you trust it.
 *   npm run eval:calibrate        (needs ANTHROPIC_API_KEY)
 */
import fs from 'fs';
import path from 'path';
import { createLlmClient } from '../llm/factory';
import { calibrateJudge, type CalibrationItem } from './judge';

const MIN_AGREEMENT = 0.85;

async function main(): Promise<void> {
  const judge = createLlmClient();
  if (!judge)
    throw new Error('Calibration needs ANTHROPIC_API_KEY. The judge must be a real model.');

  const items: CalibrationItem[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'judge-calibration.json'), 'utf-8'),
  );
  const { agreement, disagreements } = await calibrateJudge(judge, items);
  console.log(
    `Judge ${judge.name} agrees with humans on ${(agreement * 100).toFixed(0)}% of ${items.length} items`,
  );
  if (disagreements.length > 0) console.log(`Disagreements: ${disagreements.join(', ')}`);
  if (agreement < MIN_AGREEMENT) {
    console.error(`Below the ${MIN_AGREEMENT * 100}% bar. Do not use this judge as a gate yet.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
