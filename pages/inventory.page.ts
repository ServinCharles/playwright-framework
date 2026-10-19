import { Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export type SortOption = 'az' | 'za' | 'lohi' | 'hilo';

export class InventoryPage extends BasePage {
  readonly title: Locator;
  readonly itemNames: Locator;
  readonly itemPrices: Locator;
  readonly sortDropdown: Locator;
  readonly cartLink: Locator;
  readonly cartBadge: Locator;

  constructor(page: Page) {
    super(page);
    this.title = page.getByTestId('title');
    this.itemNames = page.getByTestId('inventory-item-name');
    this.itemPrices = page.getByTestId('inventory-item-price');
    this.sortDropdown = page.getByTestId('product-sort-container');
    this.cartLink = page.getByTestId('shopping-cart-link');
    this.cartBadge = page.getByTestId('shopping-cart-badge');
  }

  async open(): Promise<void> {
    await this.goto('/inventory.html');
  }

  /** Product slugs on SauceDemo look like "sauce-labs-backpack". */
  async addToCart(productSlug: string): Promise<void> {
    await this.page.getByTestId(`add-to-cart-${productSlug}`).click();
  }

  async removeFromCart(productSlug: string): Promise<void> {
    await this.page.getByTestId(`remove-${productSlug}`).click();
  }

  async sortBy(option: SortOption): Promise<void> {
    await this.sortDropdown.selectOption(option);
  }

  async names(): Promise<string[]> {
    return this.itemNames.allTextContents();
  }

  async prices(): Promise<number[]> {
    const raw = await this.itemPrices.allTextContents();
    return raw.map((text) => Number(text.replace('$', '')));
  }

  async openCart(): Promise<void> {
    await this.cartLink.click();
  }
}
