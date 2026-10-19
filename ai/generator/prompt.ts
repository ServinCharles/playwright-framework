export const CONVENTIONS = `
You write Playwright tests in TypeScript for this framework. Follow these rules exactly:
- Import test and expect ONLY from '../../fixtures' (never from '@playwright/test').
- Use the page object fixtures: loginPage, inventoryPage, cartPage, checkoutPage, plus users and checkoutData.
- Do not use page.locator with CSS. Use the page objects. Do not invent page object methods that are not listed.
- Never use waitForTimeout, test.only, page.pause or hardcoded URLs. The baseURL is configured.
- Never hardcode usernames or passwords. Use the users fixture.
- Every test must contain at least one meaningful expect().
- Tag each test title with @smoke or @regression.
- Output ONLY the TypeScript file. No explanation. No markdown fences.

Available page object methods:
- loginPage: open(), login(username, password); locators errorBanner, usernameInput, passwordInput, loginButton
- inventoryPage: open(), addToCart(slug), removeFromCart(slug), sortBy('az'|'za'|'lohi'|'hilo'), names(), prices(), openCart(); locators title, itemNames, itemPrices, cartBadge
- cartPage: startCheckout(); locators items, itemNames, title
- checkoutPage: fillDetails({firstName,lastName,postalCode}), continue(), finish(); locators completeHeader, errorBanner
`.trim();

export function buildPrompt(requirement: string): { system: string; user: string } {
  return {
    system: CONVENTIONS,
    user: `Write a Playwright spec that covers this requirement. Include one happy path and the most important negative cases.\n\nREQUIREMENT:\n${requirement.trim()}`,
  };
}
