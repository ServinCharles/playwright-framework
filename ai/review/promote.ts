/**
 * Human review gate. AI drafts live in ai-generated/ and never run in CI.
 * A named reviewer promotes a draft into tests/ui/ (accepted or edited) or rejects it.
 *
 *   npm run ai:promote -- --file ai-generated/product-sorting.spec.ts --decision accepted --reviewer "Servin" --notes "checked sort order"
 */
import fs from 'fs';
import path from 'path';
import { validateGenerated } from '../generator/validate';
import { appendLog, DEFAULT_LOG } from './log';

export type Decision = 'accepted' | 'edited' | 'rejected';

export interface PromoteOptions {
  file: string;
  decision: Decision;
  reviewer: string;
  notes?: string;
  root?: string;
  logFile?: string;
}

export function promote(options: PromoteOptions): string {
  const root = options.root ?? path.resolve(__dirname, '../..');
  const logFile = options.logFile ?? DEFAULT_LOG;
  const source = path.resolve(root, options.file);

  if (!options.reviewer.trim()) throw new Error('A named reviewer is required');
  if (!['accepted', 'edited', 'rejected'].includes(options.decision)) {
    throw new Error('decision must be accepted, edited or rejected');
  }
  if (!source.startsWith(path.join(root, 'ai-generated') + path.sep)) {
    throw new Error('Only files inside ai-generated/ can be reviewed');
  }
  if (!fs.existsSync(source)) throw new Error(`File not found: ${options.file}`);

  const code = fs.readFileSync(source, 'utf-8');
  const provider = code.match(/Provider: ([^|\n]+)/)?.[1]?.trim() ?? 'unknown';
  const date = new Date().toISOString();
  const slug = path.basename(source);

  let destination: string;
  if (options.decision === 'rejected') {
    destination = path.join(root, 'ai-generated', 'rejected', slug);
  } else {
    const check = validateGenerated(code);
    if (!check.ok)
      throw new Error(`Cannot promote, validation failed:\n- ${check.problems.join('\n- ')}`);
    destination = path.join(root, 'tests', 'ui', `ai-${slug}`);
    if (fs.existsSync(destination))
      throw new Error(`Refusing to overwrite ${path.relative(root, destination)}`);
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const stamp = `// AI-GENERATED, ${options.decision.toUpperCase()} by ${options.reviewer} on ${date.slice(0, 10)}`;
  const body = code.replace(/^\/\/ AI-GENERATED: NOT REVIEWED.*\n/m, `${stamp}\n`);
  fs.writeFileSync(destination, body);
  fs.unlinkSync(source);

  appendLog(
    {
      date,
      event: options.decision,
      file: slug,
      provider,
      reviewer: options.reviewer,
      notes: options.notes ?? '',
    },
    logFile,
  );
  return destination;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (require.main === module) {
  try {
    const destination = promote({
      file: arg('file') ?? '',
      decision: (arg('decision') ?? '') as Decision,
      reviewer: arg('reviewer') ?? '',
      notes: arg('notes'),
    });
    console.log(`Done: ${path.relative(process.cwd(), destination)}. Logged to ai/review-log.csv`);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
