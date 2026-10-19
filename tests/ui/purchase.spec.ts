import { test, expect } from '../../fixtures';

test.describe('Purchase journey', () => {
  test('user can buy a product end to end @smoke', async ({
    inventoryPage,
    cartPage,
    checkoutPage,
    checkoutData,
  }) => {
    await inventoryPage.open();
    await inventoryPage.addToCart('sauce-labs-backpack');
    await inventoryPage.openCart();

    await expect(cartPage.itemNames).toHaveText(['Sauce Labs Backpack']);
    await cartPage.startCheckout();

    await checkoutPage.fillDetails(checkoutData.valid);
    await checkoutPage.continue();
    await checkoutPage.finish();

    await expect(checkoutPage.completeHeader).toHaveText('Thank you for your order!');
  });

  test('checkout needs a first name @regression', async ({
    inventoryPage,
    cartPage,
    checkoutPage,
  }) => {
    await inventoryPage.open();
    await inventoryPage.addToCart('sauce-labs-bike-light');
    await inventoryPage.openCart();
    await cartPage.startCheckout();
    await checkoutPage.continue();

    await expect(checkoutPage.errorBanner).toContainText('First Name is required');
  });
});
