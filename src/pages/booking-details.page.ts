import { expect, type Locator, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { BasePage } from './base.page';

export type BookingStatus = 'Confirmed' | 'Car Received' | 'Invoiced' | 'Closed';

/** The mutation each Change Status choice sends, and what it answers under. */
const STATUS_MUTATIONS: Record<BookingStatus, { operation: string; payload: string }> = {
  Confirmed: { operation: 'AcceptRent', payload: 'acceptRental' },
  'Car Received': { operation: 'CarRecieved', payload: 'carReceived' },
  Invoiced: { operation: 'AllyReceiveCar', payload: 'allyReceiveCar' },
  Closed: { operation: 'CloseRental', payload: 'closeRental' },
};

/** A single booking at /cw/dashboard/bookings/<id>. */
export class BookingDetailsPage extends BasePage {
  readonly mainDetailsHeading = this.byRole('heading', { name: 'Main Booking Details' });
  /** Gone once a booking is closed. */
  readonly changeStatusButton = this.byRole('button', { name: 'Change Status' });

  constructor(page: Page) {
    super(page);
  }

  async open(bookingId: string): Promise<void> {
    await this.page.goto(`/cw/dashboard/bookings/${bookingId}`, { waitUntil: 'domcontentloaded' });
    await this.expectLoaded();
  }

  /**
   * Waits for the booking itself, not just the page: acting sooner sends
   * requests without it — Close asks for `CancelledReasons` with no `status`,
   * which the API rejects, leaving the reasons dialog empty.
   */
  async expectLoaded(): Promise<void> {
    await expect(this.mainDetailsHeading).toBeVisible();
    await expect(this.detailValue('Booking Status')).not.toBeEmpty();
  }

  /**
   * Details are `li.list_item_info` items holding a label span and a value
   * span, with nothing between them (`Booking StatusPending`), so the value is
   * read from its own span. Some labels appear in more than one section
   * (Booking Totals repeats the dates, Status is both car and customer), so the
   * first one wins.
   */
  async detail(label: string): Promise<string> {
    return (await this.detailValue(label).innerText()).trim();
  }

  private detailValue(label: string): Locator {
    const labelSpan = this.page.locator('span.text-align-localized', {
      hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`),
    });
    return this.page.locator('li.list_item_info').filter({ has: labelSpan }).first().locator('span').nth(1);
  }

  /**
   * Moves the booking on through the Change Status dialog and waits for the
   * API to accept it. Invoicing takes a grand total and asks for confirmation;
   * closing asks for a reason, and this always gives "Other" with `note`, so a
   * closed test booking says who closed it.
   */
  async changeStatus(
    status: BookingStatus,
    { grandTotal, note }: { grandTotal?: number; note?: string } = {},
  ): Promise<void> {
    await this.changeStatusButton.click();
    const dialog = this.byRole('dialog').filter({ hasText: 'Change Status' });
    // The list fills in after GetStatus answers — Confirmed appears a beat
    // after the others — so the row is waited for, not assumed.
    const row = dialog.locator('[role=radiogroup] > div').filter({ has: this.page.getByText(status, { exact: true }) });
    await row.locator('input').check();

    const { operation, payload } = STATUS_MUTATIONS[status];
    const response = this.page.waitForResponse((r) => isOperation(r, operation), { timeout: 30_000 });
    // Closing asks for a reason from a list fetched when Change is pressed.
    const closeReasons =
      status === 'Closed' ? this.page.waitForResponse((r) => isOperation(r, 'CancelledReasons')) : undefined;

    if (status === 'Invoiced') {
      expect(grandTotal, 'invoicing needs a grand total').toBeDefined();
      await dialog.locator('#grandTotal').fill(String(grandTotal));
    }
    await dialog.getByRole('button', { name: 'Change', exact: true }).click();

    if (status === 'Invoiced') {
      const confirm = this.byRole('dialog').filter({ hasText: 'Are you sure you want to invoice the booking?' });
      await confirm.getByRole('button', { name: 'Confirm' }).click();
    }
    if (closeReasons) {
      const answered = await closeReasons;
      const listed = await answered.json();
      const offered = listed.data?.cancelledReasons ?? [];
      const asked = JSON.stringify(answered.request().postDataJSON().variables);
      expect(offered.length > 0, `CancelledReasons for ${asked} answered ${JSON.stringify(listed)}`).toBe(true);
      const reasons = this.byRole('dialog').filter({ hasText: 'Booking Close Reasons' });
      // The reason radios ignore check(); clicking the label selects them.
      await reasons.getByText('Other:', { exact: true }).click();
      await expect(reasons.getByRole('radio', { name: 'Other:' })).toBeChecked();
      await reasons.getByRole('textbox').fill(note ?? 'Closed by the Carwah Dashboard automated test');
      await reasons.getByRole('button', { name: 'Close Booking' }).click();
    }

    const body = await (await response).json();
    expect(body.errors ?? body.data?.[payload]?.errors ?? [], `${operation} errors`).toEqual([]);
    expect(body.data?.[payload]?.status, `${operation} answered ${JSON.stringify(body)}`).toBe('success');
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
