import { test as setup, expect } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';
import { InventoryPage } from '../../pages/inventory.page';
import users from '../../data/users.json';

/** Runs once before the UI projects and saves the logged-in session to .auth/standard.json */
setup('log in as the standard user', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.open();
  await loginPage.login(users.standard.username, users.standard.password);
  await expect(new InventoryPage(page).title).toHaveText('Products');
  await page.context().storageState({ path: '.auth/standard.json' });
});
