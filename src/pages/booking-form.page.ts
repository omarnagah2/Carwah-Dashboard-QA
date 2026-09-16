import { expect, type Page } from '@playwright/test';
import { BasePage } from './base.page';

/** What Add Booking and Edit Booking share: the price summary and payment method. */
export abstract class BookingFormPage extends BasePage {
  readonly priceHeading = this.byRole('heading', { name: 'About price' });
  readonly cashPayment = this.byRole('radio', { name: 'Cash' });
  readonly pickupCity = this.page.getByRole('textbox', { name: 'Pickup City' });

  protected constructor(page: Page) {
    super(page);
  }

  /** A figure from the About price summary, e.g. `Due Amount`. */
  async price(label: string | RegExp): Promise<number> {
    const line = this.priceHeading
      .locator('xpath=..')
      .getByRole('listitem')
      .filter({ hasText: label })
      .first();
    await expect(line).toHaveText(/\d/);
    const numbers = (await line.innerText()).match(/-?\d+(\.\d+)?/g)!;
    return Number(numbers[numbers.length - 1]);
  }
}
