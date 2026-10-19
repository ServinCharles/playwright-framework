import { test, expect } from '@playwright/test';
import { stripFences, validateGenerated } from '../../ai/generator/validate';
import { SAMPLE_RESPONSE } from '../../ai/fixtures/sample-response';

test.describe('Generated test validator', () => {
  test('accepts a well formed spec @smoke', () => {
    expect(validateGenerated(SAMPLE_RESPONSE)).toEqual({ ok: true, problems: [] });
  });

  test('rejects fixed waits, hardcoded URLs and credentials', () => {
    const bad = `import { test, expect } from '../../fixtures';
test('x', async ({ page }) => {
  await page.goto('https://example.com');
  await page.waitForTimeout(3000);
  const password = 'hunter2';
  expect(password).toBeTruthy();
});`;
    const { ok, problems } = validateGenerated(bad);
    expect(ok).toBe(false);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('waitForTimeout'),
        expect.stringContaining('hardcodes a URL'),
        expect.stringContaining('hardcodes a credential'),
      ]),
    );
  });

  test('rejects a test with no assertions', () => {
    const code = `import { test } from '../../fixtures';\ntest('x', async ({ inventoryPage }) => { await inventoryPage.open(); });`;
    expect(validateGenerated(code).problems).toEqual(
      expect.arrayContaining([expect.stringContaining('no expect()')]),
    );
  });

  test('rejects tests that import from playwright directly', () => {
    const code = `import { test, expect } from '@playwright/test';\ntest('x', async () => { expect(1).toBe(1); });`;
    expect(validateGenerated(code).problems).toEqual(
      expect.arrayContaining([expect.stringContaining('fixtures')]),
    );
  });

  test('rejects test.only and markdown fences', () => {
    const code =
      '```ts\nimport { test, expect } from "../../fixtures";\ntest.only("x", async () => { expect(1).toBe(1); });\n```';
    const { problems } = validateGenerated(code);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('fences'),
        expect.stringContaining('test.only'),
      ]),
    );
  });

  test('stripFences removes the markdown wrapper', () => {
    expect(stripFences('```typescript\nconst a = 1;\n```')).toBe('const a = 1;\n');
    expect(stripFences('const b = 2;')).toBe('const b = 2;\n');
  });
});
