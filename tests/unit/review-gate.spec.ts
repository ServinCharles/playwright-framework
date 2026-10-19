import fs from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from '@playwright/test';
import { SAMPLE_RESPONSE } from '../../ai/fixtures/sample-response';
import { appendLog, computeStats, readLog } from '../../ai/review/log';
import { promote } from '../../ai/review/promote';

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-gate-'));
  fs.mkdirSync(path.join(root, 'ai-generated'), { recursive: true });
  const draft = (name: string, code = SAMPLE_RESPONSE) => {
    const file = path.join(root, 'ai-generated', name);
    fs.writeFileSync(
      file,
      `// AI-GENERATED: NOT REVIEWED. Do not merge until a person has reviewed it.\n// Source: requirements/x.md | Provider: mock | Generated: now\n${code}`,
    );
    return `ai-generated/${name}`;
  };
  return { root, logFile: path.join(root, 'log.csv'), draft };
}

test.describe('Human review gate', () => {
  test('accepting a draft moves it into tests/ui and logs it @smoke', () => {
    const { root, logFile, draft } = workspace();
    const dest = promote({
      file: draft('a.spec.ts'),
      decision: 'accepted',
      reviewer: 'Servin',
      root,
      logFile,
    });

    expect(dest).toBe(path.join(root, 'tests', 'ui', 'ai-a.spec.ts'));
    expect(fs.readFileSync(dest, 'utf-8')).toContain('ACCEPTED by Servin');
    expect(fs.readFileSync(dest, 'utf-8')).not.toContain('NOT REVIEWED');
    expect(fs.existsSync(path.join(root, 'ai-generated', 'a.spec.ts'))).toBe(false);
    expect(readLog(logFile)).toMatchObject([
      { event: 'accepted', reviewer: 'Servin', provider: 'mock' },
    ]);
  });

  test('rejecting a draft archives it under ai-generated/rejected', () => {
    const { root, logFile, draft } = workspace();
    const dest = promote({
      file: draft('b.spec.ts'),
      decision: 'rejected',
      reviewer: 'Servin',
      notes: 'weak asserts',
      root,
      logFile,
    });
    expect(dest).toBe(path.join(root, 'ai-generated', 'rejected', 'b.spec.ts'));
    expect(readLog(logFile)[0].notes).toBe('weak asserts');
  });

  test('a reviewer name is required', () => {
    const { root, logFile, draft } = workspace();
    expect(() =>
      promote({ file: draft('c.spec.ts'), decision: 'accepted', reviewer: ' ', root, logFile }),
    ).toThrow('reviewer');
  });

  test('a draft that fails validation cannot be promoted', () => {
    const { root, logFile, draft } = workspace();
    const bad = draft(
      'd.spec.ts',
      `import { test } from '../../fixtures';\ntest('x', async () => {});`,
    );
    expect(() =>
      promote({ file: bad, decision: 'accepted', reviewer: 'Servin', root, logFile }),
    ).toThrow('validation failed');
  });

  test('only files inside ai-generated can be reviewed', () => {
    const { root, logFile } = workspace();
    fs.writeFileSync(path.join(root, 'evil.spec.ts'), SAMPLE_RESPONSE);
    expect(() =>
      promote({ file: 'evil.spec.ts', decision: 'accepted', reviewer: 'Servin', root, logFile }),
    ).toThrow('ai-generated');
    expect(() =>
      promote({ file: '../evil.spec.ts', decision: 'accepted', reviewer: 'Servin', root, logFile }),
    ).toThrow();
  });

  test('stats show acceptance, edit and rejection rates', () => {
    const { logFile } = workspace();
    const row = (event: 'generated' | 'accepted' | 'edited' | 'rejected') =>
      appendLog(
        {
          date: 'd',
          event,
          file: 'f',
          provider: 'p',
          reviewer: 'r',
          notes: 'has, comma and "quotes"',
        },
        logFile,
      );
    [
      'generated',
      'generated',
      'generated',
      'generated',
      'accepted',
      'accepted',
      'edited',
      'rejected',
    ].forEach((e) => row(e as 'generated'));

    const stats = computeStats(readLog(logFile));
    expect(stats).toMatchObject({ generated: 4, accepted: 2, edited: 1, rejected: 1, pending: 0 });
    expect(stats.acceptanceRate).toBe(0.5);
    expect(readLog(logFile)[0].notes).toBe('has, comma and "quotes"');
  });
});
