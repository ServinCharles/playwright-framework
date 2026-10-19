/**
 * Turns a plain-English requirement into a DRAFT Playwright spec in ai-generated/.
 * Drafts never run in CI. A person must review and promote them (see ai/review/promote.ts).
 *
 *   npm run ai:generate -- --requirement requirements/product-sorting.md
 *   npm run ai:generate -- --requirement requirements/product-sorting.md --provider anthropic
 */
import fs from 'fs';
import path from 'path';
import { env } from '../../utils/env';
import { appendLog } from '../review/log';
import { buildPrompt } from './prompt';
import { anthropicProvider, mockProvider, type Provider } from './providers';
import { stripFences, validateGenerated } from './validate';

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

  const requirement = fs.readFileSync(requirementPath, 'utf-8');
  const provider = pickProvider();
  const { system, user } = buildPrompt(requirement);

  console.log(`Generating with ${provider.name} ...`);
  const code = stripFences(await provider.generate(system, user));
  const slug = path.basename(requirementPath, path.extname(requirementPath));
  const outDir = path.resolve(__dirname, '../../ai-generated');
  fs.mkdirSync(outDir, { recursive: true });

  const check = validateGenerated(code);
  if (!check.ok) {
    const invalid = path.join(outDir, `${slug}.invalid.txt`);
    fs.writeFileSync(invalid, code);
    console.error('Draft failed validation, not saved as a spec:');
    check.problems.forEach((p) => console.error(`- ${p}`));
    console.error(`Raw output kept for debugging: ${path.relative(process.cwd(), invalid)}`);
    process.exit(1);
  }

  const date = new Date().toISOString();
  const header =
    `// AI-GENERATED: NOT REVIEWED. Do not merge until a person has reviewed it.\n` +
    `// Source: ${requirementPath} | Provider: ${provider.name} | Generated: ${date}\n`;
  const out = path.join(outDir, `${slug}.spec.ts`);
  fs.writeFileSync(out, header + code);
  appendLog({
    date,
    event: 'generated',
    file: path.basename(out),
    provider: provider.name,
    reviewer: '',
    notes: '',
  });

  console.log(`Draft saved: ${path.relative(process.cwd(), out)}`);
  console.log(
    'Next: review it, then npm run ai:promote -- --file <draft> --decision accepted --reviewer "<your name>"',
  );
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
