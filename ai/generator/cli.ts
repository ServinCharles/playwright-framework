/**
 * Turns a plain-English requirement into a DRAFT Playwright spec in ai-generated/.
 * Drafts never run in CI. A person must review and promote them (see ai/review/promote.ts).
 *
 *   npm run ai:generate -- --requirement requirements/product-sorting.md
 *   npm run ai:generate -- --requirement requirements/product-sorting.md --provider anthropic
 */
import path from 'path';
import { env } from '../../utils/env';
import { generateDraft } from './generate';
import { anthropicProvider, mockProvider, type Provider } from './providers';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function pickProvider(): Provider {
  const choice = arg('provider') ?? (env.anthropicApiKey ? 'anthropic' : 'mock');
  if (choice === 'anthropic') {
    if (!env.anthropicApiKey)
      throw new Error('ANTHROPIC_API_KEY is not set. Use --provider mock to demo offline.');
    return anthropicProvider(env.anthropicApiKey, env.anthropicModel);
  }
  return mockProvider;
}

async function main(): Promise<void> {
  const requirementPath = arg('requirement');
  if (!requirementPath) throw new Error('Usage: --requirement <file> [--provider mock|anthropic]');

  const provider = pickProvider();
  console.log(`Generating with ${provider.name} ...`);
  const result = await generateDraft(requirementPath, provider);

  if (!result.ok) {
    console.error('Draft failed validation, not saved as a spec:');
    result.problems.forEach((p) => console.error(`- ${p}`));
    console.error(`Raw output kept for debugging: ${path.relative(process.cwd(), result.rawFile)}`);
    process.exit(1);
  }

  console.log(`Draft saved: ${path.relative(process.cwd(), result.file)}`);
  console.log(
    'Next: review it, then npm run ai:promote -- --file <draft> --decision accepted --reviewer "<your name>"',
  );
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
