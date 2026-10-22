import { test, expect } from '../../fixtures';

test.describe('Cart', () => {
  test('an added product appears in the cart @smoke', async ({ inventoryPage, cartPage }) => {
    await inventoryPage.open();
    await inventoryPage.addToCart('sauce-labs-backpack');

    await cartPage.open();
    await expect(cartPage.itemNames).toHaveCount(1);
    await expect(cartPage.itemNames.first()).toHaveText('Sauce Labs Backpack');
  });

  test('removing a product empties the cart @regression', async ({ inventoryPage, cartPage }) => {
    await inventoryPage.open();
    await inventoryPage.addToCart('sauce-labs-backpack');

    await cartPage.open();
    await cartPage.removeItem('sauce-labs-backpack');
    await expect(cartPage.items).toHaveCount(0);
  });

  test('the cart keeps several products @regression', async ({ inventoryPage, cartPage }) => {
    await inventoryPage.open();
    await inventoryPage.addToCart('sauce-labs-backpack');
    await inventoryPage.addToCart('sauce-labs-bike-light');

    await cartPage.open();
    await expect(cartPage.itemNames).toHaveCount(2);
  });
});
