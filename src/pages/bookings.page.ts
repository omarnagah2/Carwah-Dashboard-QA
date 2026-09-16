import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { BasePage } from './base.page';
import { BookingFilters } from './booking-filters.component';

/** The bookings list at /cw/dashboard/bookings. */
export class BookingsPage extends BasePage {
  /**
   * The page also holds a hidden ratings table ahead of this one, so the
   * bookings table is picked out by its own header. With no results there is
   * no table at all, only `noRecords`.
   */
  readonly table = this.page
    .getByRole('table')
    .filter({ has: this.page.getByRole('columnheader', { name: 'Booking ID' }) });
  readonly rows = this.table.locator('tbody tr');
  readonly noRecords = this.page.getByText('No records found!');
  readonly totalResults = this.page.getByText(/^Total Results: \d+$/);
  readonly pageSizeButton = this.byRole('button', { name: 'Without label' });
  readonly filters = new BookingFilters(this.page);

  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    const listed = this.page.waitForResponse((r) => isOperation(r, 'GetBookingsQuery'), { timeout: 30_000 });
    await this.page.goto('/cw/dashboard/bookings', { waitUntil: 'domcontentloaded' });
    const response = await listed;
    const body = await response.text();
    expect(response.ok() && !body.includes('"errors"'), `GetBookingsQuery answered ${response.status()}: ${body.slice(0, 300)}`).toBe(true);
    await expect(this.rows.first()).toBeVisible();
  }

  /**
   * Status tabs are named "<count> <status>", and several statuses share a
   * prefix (Pending, Pending Extend, Pending Review), so the name is anchored.
   */
  statusTab(status: string): Locator {
    return this.byRole('tab', { name: new RegExp(`^\\d+\\s+${status}$`) });
  }

  async statusCount(status: string): Promise<number> {
    return Number((await this.statusTab(status).innerText()).match(/\d+/)![0]);
  }

  async total(): Promise<number> {
    return Number((await this.totalResults.innerText()).match(/\d+/)![0]);
  }

  async selectStatus(status: string): Promise<void> {
    await this.reloadingList(() => this.statusTab(status).click());
    await expect(this.statusTab(status)).toHaveAttribute('aria-selected', 'true');
  }

  async goToPage(pageNumber: number): Promise<void> {
    // Exact: with 2000+ pages, "Go to page 2" also names "Go to page 2001".
    await this.reloadingList(() => this.byRole('button', { name: `Go to page ${pageNumber}`, exact: true }).click());
    await expect(this.byRole('button', { name: `page ${pageNumber}`, exact: true })).toHaveAttribute('aria-current', 'true');
  }

  async setPageSize(size: 10 | 25 | 50 | 100): Promise<void> {
    await this.pageSizeButton.click();
    await this.reloadingList(() => this.byRole('option', { name: String(size), exact: true }).click());
  }

  /**
   * Runs the search with whatever the filter panel holds, and returns what was
   * asked for and the bookings the API answered with — several filters (rent
   * type, sub-status) are only visible in the latter.
   */
  async applyFilters(): Promise<{ query: Record<string, unknown>; bookings: ListedBooking[] }> {
    const response = await this.reloadingList(() => this.filters.searchButton.click());
    const body = await response.json();
    const [result] = Object.values(body.data ?? {}) as { collection?: ListedBooking[] }[];
    return { query: response.request().postDataJSON().variables, bookings: result?.collection ?? [] };
  }

  async clearFilters(): Promise<void> {
    await this.reloadingList(() => this.filters.clearButton.click());
  }

  async searchByBookingNo(bookingNo: string): Promise<void> {
    await this.filters.open();
    await this.filters.bookingNo.fill(bookingNo);
    await this.applyFilters();
  }

  /**
   * The text of every row's cell under `header`, located by the header's
   * position. Headers are matched on their text content — the page
   * capitalises some on screen (`Rented days` shows as `Rented Days`).
   */
  async column(header: string): Promise<string[]> {
    const headers = (await this.table.locator('thead th').allTextContents()).map((text) => text.trim());
    const index = headers.indexOf(header);
    expect(index, `column "${header}" in ${headers.join(' | ')}`).toBeGreaterThanOrEqual(0);
    return this.rows.evaluateAll(
      (rows, i) => rows.map((row) => (row as HTMLTableRowElement).cells[i]?.innerText.replace(/\s+/g, ' ').trim() ?? ''),
      index,
    );
  }

  /**
   * One listed booking as header → cell text. The Booking No./ID search
   * matches parts of booking numbers too (21597 also finds E21597), so a
   * search can list more than the booking asked for; this picks it by id.
   */
  async listedBooking(bookingId: string): Promise<Record<string, string>> {
    const headers = (await this.table.locator('thead th').allTextContents()).map((text) => text.trim());
    const ids = await this.column('Booking ID');
    const index = ids.indexOf(bookingId);
    expect(index, `booking ${bookingId} among ${ids.join(', ')}`).toBeGreaterThanOrEqual(0);
    const cells = await this.rows
      .nth(index)
      .evaluate((row) => [...(row as HTMLTableRowElement).cells].map((cell) => cell.innerText.replace(/\s+/g, ' ').trim()));
    return Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? '']));
  }

  async openBooking(bookingId: string): Promise<void> {
    await this.table.getByRole('link', { name: bookingId, exact: true }).first().click();
    await expect(this.page).toHaveURL(new RegExp(`/cw/dashboard/bookings/${bookingId}$`));
  }

  /**
   * Runs `action` and waits for the list query it triggers, so assertions read
   * the new rows rather than the ones still on screen.
   */
  private async reloadingList(action: () => Promise<void>): Promise<Response> {
    // Bounded, so an action that never queries (the Airports filter) fails
    // with a reason instead of running into the test timeout — but long
    // enough for API pacing, which has held a list query over 10s.
    const response = this.page.waitForResponse((r) => isOperation(r, 'GetBookingsQuery'), { timeout: 30_000 });
    await action();
    const answered = await response;
    expect(answered.ok(), `GetBookingsQuery answered ${answered.status()}`).toBeTruthy();
    await expect(this.rows.first().or(this.noRecords)).toBeVisible();
    return answered;
  }
}

/** The fields of a `GetBookingsQuery` row that specs check. */
export interface ListedBooking {
  id: string;
  status: string;
  subStatus: string;
  isRentToOwn: boolean;
  branchName: string;
  agencyName: string | null;
  dropOffDate: string;
}

