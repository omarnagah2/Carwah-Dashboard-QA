import { expect, type Page } from '@playwright/test';
import { BasePage } from './base.page';

/** A single booking at /cw/dashboard/bookings/<id>. */
export class BookingDetailsPage extends BasePage {
  readonly mainDetailsHeading = this.byRole('heading', { name: 'Main Booking Details' });

  constructor(page: Page) {
    super(page);
  }

  async expectLoaded(): Promise<void> {
    await expect(this.mainDetailsHeading).toBeVisible();
  }

  /**
   * Details are `li.list_item_info` items holding a label span and a value
   * span, with nothing between them (`Booking StatusPending`), so the value is
   * read from its own span. Some labels appear in more than one section
   * (Booking Totals repeats the dates, Status is both car and customer), so the
   * first one wins.
   */
  async detail(label: string): Promise<string> {
    const labelSpan = this.page.locator('span.text-align-localized', {
      hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`),
    });
    const item = this.page.locator('li.list_item_info').filter({ has: labelSpan }).first();
    return (await item.locator('span').nth(1).innerText()).trim();
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
