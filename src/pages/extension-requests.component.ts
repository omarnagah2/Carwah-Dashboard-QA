import { expect, type Locator, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { pickDate } from './date-time-picker.component';

/** What `RentalExtensionRequestPrice` quotes for a new drop-off. */
export interface ExtensionQuote {
  extensionDays: number;
  pricePerDay: number;
  totalRemainingPrice: number;
}

/** A row of the Extension Requests table, by column. */
export interface ListedExtension {
  requestNo: string;
  days: string;
  dueValue: string;
  requestStatus: string;
  paymentStatus: string;
  paidBy: string;
}

/**
 * The Extension Requests dialog on a booking's details page. Its **Add** is
 * only offered while the booking is Car Received; requests are listed newest
 * first, numbered `<booking no.>-2`, `-3`…
 */
export class ExtensionRequests {
  readonly dialog: Locator;
  readonly addButton: Locator;
  readonly rows: Locator;

  constructor(private readonly page: Page) {
    this.dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Extension Requests' }) });
    this.addButton = this.dialog.getByRole('button', { name: 'Add', exact: true });
    this.rows = this.dialog.getByRole('rowgroup').nth(1).getByRole('row');
  }

  async expectOpen(): Promise<void> {
    await expect(this.dialog.getByRole('table').or(this.dialog.getByText('No records found!'))).toBeVisible();
  }

  async close(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.dialog).toBeHidden();
  }

  async listed(): Promise<ListedExtension[]> {
    if (!(await this.dialog.getByRole('table').count())) {
      return [];
    }
    const headers = (await this.dialog.getByRole('columnheader').allTextContents()).map((h) => h.trim().toLowerCase());
    const at = (name: string) => headers.indexOf(name);
    return this.rows.evaluateAll(
      (rows, columns) =>
        rows.map((row) => {
          const cells = [...(row as HTMLTableRowElement).cells].map((cell) => cell.innerText.replace(/\s+/g, ' ').trim());
          return {
            requestNo: cells[columns.requestNo],
            days: cells[columns.days],
            dueValue: cells[columns.dueValue],
            requestStatus: cells[columns.requestStatus],
            paymentStatus: cells[columns.paymentStatus],
            paidBy: cells[columns.paidBy],
          };
        }),
      {
        requestNo: at('request no.'),
        days: at('extension days'),
        dueValue: at('due value'),
        requestStatus: at('request status'),
        paymentStatus: at('payment status'),
        paidBy: at('paid by'),
      },
    );
  }

  /**
   * Adds a request for a new drop-off day and creates it, returning the
   * API's quote. The new row's picker opens on the day after the current
   * drop-off and keeps the current time of day, so the API — not the
   * caller — decides how many days that is; the row must show its figures.
   */
  async request(currentDropoff: Date, newDropoff: Date): Promise<ExtensionQuote> {
    await this.addButton.click();
    const draft = this.dialog.getByRole('row').filter({ has: this.page.getByRole('button', { name: 'Create request' }) });
    const quoted = this.page.waitForResponse((r) => isOperation(r, 'RentalExtensionRequestPrice'));
    const opensOn = new Date(currentDropoff);
    opensOn.setDate(opensOn.getDate() + 1);
    await pickDate(this.page, draft.getByRole('textbox', { name: 'dropoff Date' }), opensOn, newDropoff);
    const quote: ExtensionQuote = (await (await quoted).json()).data.rentalExtensionRequestPrice;
    // Extension Days and Due Value are the third and fourth cells.
    await expect(draft.getByRole('cell').nth(2)).toHaveText(`${quote.extensionDays} day`);
    await expect(draft.getByRole('cell').nth(3)).toHaveText(String(quote.totalRemainingPrice));

    const created = this.page.waitForResponse((r) => isOperation(r, 'CreateRentalDateExtensionRequest'));
    await draft.getByRole('button', { name: 'Create request' }).click();
    const body = await (await created).json();
    const result = body.data?.createRentalDateExtensionRequest;
    expect(body.errors ?? result?.errors ?? [], 'CreateRentalDateExtensionRequest errors').toEqual([]);
    expect(result?.rentalDateExtensionRequest?.status).toBe('pending');
    return quote;
  }

  /** Confirms the pending request; Confirm asks first, Reject does not. */
  async confirmPending(): Promise<void> {
    const response = this.page.waitForResponse((r) => isOperation(r, 'ConfirmRentalDateExtensionRequest'));
    // Confirm's icon carries a `disabled` attribute that does nothing.
    await this.pending().locator('label[title="Confirm"]').click();
    const sure = this.page.locator('.swal-modal');
    await expect(sure).toContainText('Are you sure you want to confirm this extension?');
    await sure.getByRole('button', { name: 'Yes' }).click();
    await this.expectAccepted(await response, 'confirmRentalDateExtensionRequest');
  }

  async rejectPending(): Promise<void> {
    const response = this.page.waitForResponse((r) => isOperation(r, 'RejectRentalDateExtensionRequest'));
    await this.pending().locator('label[title="Reject"]').click();
    await this.expectAccepted(await response, 'rejectRentalDateExtensionRequest');
  }

  /** A row's text content runs its cells together (`CashPendingNot Paid`), so match the cell. */
  private pending(): Locator {
    return this.rows.filter({ has: this.page.getByRole('cell', { name: 'Pending', exact: true }) });
  }

  private async expectAccepted(response: Awaited<ReturnType<Page['waitForResponse']>>, payload: string): Promise<void> {
    const body = await response.json();
    expect(body.errors ?? body.data?.[payload]?.errors ?? [], `${payload} errors`).toEqual([]);
    expect(body.data?.[payload]?.status, `${payload} answered ${JSON.stringify(body).slice(0, 300)}`).toBe('success');
  }
}
