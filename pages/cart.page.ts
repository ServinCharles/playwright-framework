import { Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class CartPage extends BasePage {
  readonly title: Locator;
  readonly items: Locator;
  readonly itemNames: Locator;
  readonly checkoutButton: Locator;

  constructor(page: Page) {
    super(page);
    this.title = page.getByTestId('title');
    this.items = page.getByTestId('inventory-item');
    this.itemNames = page.getByTestId('inventory-item-name');
    this.checkoutButton = page.getByTestId('checkout');
  }

  async open(): Promise<void> {
    await this.goto('/cart.html');
  }

  async removeItem(slug: string): Promise<void> {
    await this.page.getByTestId(`remove-${slug}`).click();
  }

  async startCheckout(): Promise<void> {
    await this.checkoutButton.click();
  }
}
