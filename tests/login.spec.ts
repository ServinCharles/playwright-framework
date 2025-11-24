import { test } from '@playwright/test';
import { LoginPage } from '../pages/login.page';

test.describe('Authentication Tests', () => {
    let loginPage: LoginPage;

    test.beforeEach(async ({ page }) => {
        loginPage = new LoginPage(page);
        await loginPage.navigate('https://www.saucedemo.com/');
    });

    test('Standard User Login', async ({ page }) => {
        await loginPage.login('standard_user', 'secret_sauce');
        // Verification logic here
    });

    test('Locked Out User Login', async () => {
        await loginPage.login('locked_out_user', 'secret_sauce');
        await loginPage.assertLoginFailed();
    });
});