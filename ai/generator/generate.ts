import fs from 'fs';
import path from 'path';
import { DEFAULT_LOG, appendLog } from '../review/log';
import { buildPrompt } from './prompt';
import type { Provider } from './providers';
import { stripFences, validateGenerated } from './validate';

export type GenerateResult =
  { ok: true; file: string } | { ok: false; problems: string[]; rawFile: string };

/** Requirement in, validated DRAFT spec out (in ai-generated/). Never runs the draft. */
export async function generateDraft(
  requirementPath: string,
  provider: Provider,
  outDir = path.resolve(__dirname, '../../ai-generated'),
  logFile = DEFAULT_LOG,
): Promise<GenerateResult> {
  const requirement = fs.readFileSync(requirementPath, 'utf-8');
  const { system, user } = buildPrompt(requirement);
  const code = stripFences(await provider.generate(system, user));
  const slug = path.basename(requirementPath, path.extname(requirementPath));
  fs.mkdirSync(outDir, { recursive: true });

  const check = validateGenerated(code);
  if (!check.ok) {
    const rawFile = path.join(outDir, `${slug}.invalid.txt`);
    fs.writeFileSync(rawFile, code);
    return { ok: false, problems: check.problems, rawFile };
  }

  const date = new Date().toISOString();
  const header =
    `// AI-GENERATED: NOT REVIEWED. Do not merge until a person has reviewed it.\n` +
    `// Source: ${requirementPath} | Provider: ${provider.name} | Generated: ${date}\n`;
  const file = path.join(outDir, `${slug}.spec.ts`);
  fs.writeFileSync(file, header + code);
  appendLog(
    {
      date,
      event: 'generated',
      file: path.basename(file),
      provider: provider.name,
      reviewer: '',
      notes: '',
    },
    logFile,
  );
  return { ok: true, file };
}
