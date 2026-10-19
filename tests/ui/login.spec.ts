import { test, expect } from '../../fixtures';

// Login tests must start logged out, so they ignore the stored session
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.open();
  });

  test('standard user can log in @smoke', async ({ loginPage, inventoryPage, users }) => {
    await loginPage.login(users.standard.username, users.standard.password);
    await expect(inventoryPage.title).toHaveText('Products');
    await expect(inventoryPage.itemNames).not.toHaveCount(0);
  });

  test('locked out user sees an error @regression', async ({ loginPage, users }) => {
    await loginPage.login(users.lockedOut.username, users.lockedOut.password);
    await expect(loginPage.errorBanner).toContainText('locked out');
  });

  test('wrong password is rejected @regression', async ({ loginPage, users }) => {
    await loginPage.login(users.wrongPassword.username, users.wrongPassword.password);
    await expect(loginPage.errorBanner).toContainText('do not match');
  });

  test('empty form asks for a username @regression', async ({ loginPage }) => {
    await loginPage.loginButton.click();
    await expect(loginPage.errorBanner).toContainText('Username is required');
  });
});
