import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { InventoryPage } from '../pages/inventory.page';
import { CartPage } from '../pages/cart.page';
import { CheckoutPage } from '../pages/checkout.page';
import users from '../data/users.json';
import checkout from '../data/checkout.json';

type Fixtures = {
  loginPage: LoginPage;
  inventoryPage: InventoryPage;
  cartPage: CartPage;
  checkoutPage: CheckoutPage;
  users: typeof users;
  checkoutData: typeof checkout;
};

/** Import `test` and `expect` from here so every spec gets page objects and data for free. */
export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  inventoryPage: async ({ page }, use) => use(new InventoryPage(page)),
  cartPage: async ({ page }, use) => use(new CartPage(page)),
  checkoutPage: async ({ page }, use) => use(new CheckoutPage(page)),
  // Playwright requires an object pattern as the first argument, even when it is unused
  // eslint-disable-next-line no-empty-pattern
  users: async ({}, use) => use(users),
  // eslint-disable-next-line no-empty-pattern
  checkoutData: async ({}, use) => use(checkout),
});

export { expect };
