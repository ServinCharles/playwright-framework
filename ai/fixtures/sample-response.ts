/** Canned model output used by the "mock" provider so the pipeline can be demoed offline. */
export const SAMPLE_RESPONSE = `import { test, expect } from '../../fixtures';

test.describe('Product sorting (AI draft)', () => {
  test.beforeEach(async ({ inventoryPage }) => {
    await inventoryPage.open();
  });

  test('sorts by name A to Z @regression', async ({ inventoryPage }) => {
    await inventoryPage.sortBy('az');
    const names = await inventoryPage.names();
    expect(names).toEqual([...names].sort());
  });

  test('sorts by price high to low @regression', async ({ inventoryPage }) => {
    await inventoryPage.sortBy('hilo');
    const prices = await inventoryPage.prices();
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });
});
`;
