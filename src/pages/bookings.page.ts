import { expect, type Locator, type Page } from '@playwright/test';
import { BookingFilters } from './booking-filters.component';
import { ListPage } from './list.page';

/** The bookings list at /cw/dashboard/bookings. */
export class BookingsPage extends ListPage {
  readonly filters = new BookingFilters(this.page);

  constructor(page: Page) {
    super(page, 'Booking ID', 'GetBookingsQuery');
  }

  async open(): Promise<void> {
    await this.openAt('/cw/dashboard/bookings');
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

  async selectStatus(status: string): Promise<void> {
    await this.reloadingList(() => this.statusTab(status).click());
    await expect(this.statusTab(status)).toHaveAttribute('aria-selected', 'true');
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
   * One listed booking as header → cell text. The Booking No./ID search
   * matches parts of booking numbers too (21597 also finds E21597), so a
   * search can list more than the booking asked for; this picks it by id.
   */
  async listedBooking(bookingId: string): Promise<Record<string, string>> {
    return this.row('Booking ID', bookingId);
  }

  async openBooking(bookingId: string): Promise<void> {
    await this.table.getByRole('link', { name: bookingId, exact: true }).first().click();
    await expect(this.page).toHaveURL(new RegExp(`/cw/dashboard/bookings/${bookingId}$`));
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
