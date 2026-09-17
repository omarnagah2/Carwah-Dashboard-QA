import type { Locator, Page } from '@playwright/test';
import { escapeRegExp } from '../utils/text';

/**
 * The details pages (bookings, customers) list their facts as
 * `li.list_item_info` items holding a label span and a value span, with
 * nothing between them (`Booking StatusPending`), so a value is read from its
 * own span. Some labels appear in more than one section (a booking's Totals
 * repeat its dates), so the first one wins.
 */
export function detailValue(page: Page, label: string): Locator {
  const labelSpan = page.locator('span.text-align-localized', {
    hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`),
  });
  return page.locator('li.list_item_info').filter({ has: labelSpan }).first().locator('span').nth(1);
}

export async function readDetail(page: Page, label: string): Promise<string> {
  return (await detailValue(page, label).innerText()).trim();
}
