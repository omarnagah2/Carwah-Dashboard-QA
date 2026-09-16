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
  /** Still offered on a closed booking. */
  readonly assignButton = this.byRole('button', { name: 'Assign To' });
  readonly customerCareList = this.byRole('dialog').filter({ hasText: 'Customer Care List' });
  readonly editButton = this.byRole('button', { name: 'Edit', exact: true });
  readonly timelineButton = this.byRole('button', { name: 'Timeline' });
  readonly timeline = this.byRole('dialog').filter({ hasText: 'Booking TimeLine' });
  readonly addNoteButton = this.byRole('button', { name: 'Add Note' });
  readonly noteDialog = this.byRole('dialog').filter({ has: this.page.getByRole('button', { name: 'Add', exact: true }) });

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

  async edit(): Promise<void> {
    await this.editButton.click();
    await expect(this.page).toHaveURL(/\/cw\/dashboard\/bookings\/\d+\/edit$/);
  }

  /**
   * The newest Timeline entry's "new Data" lines, whitespace-collapsed
   * (`notes : …`, `total_booking_price : 455.4`). Entries are newest first,
   * after a leading `Booking ID` line. Closes the Timeline again.
   */
  async latestChange(): Promise<string[]> {
    await this.timelineButton.click();
    const newest = this.timeline
      .getByRole('tabpanel')
      .getByRole('listitem')
      .filter({ has: this.page.getByRole('heading', { name: 'new Data' }) })
      .first();
    const lines = newest
      .getByRole('heading', { name: 'new Data' })
      .locator('xpath=following-sibling::*[1]')
      .getByRole('listitem');
    await expect(lines.first()).toBeVisible();
    const changes = (await lines.allInnerTexts()).map((line) => line.replace(/\s+/g, ' ').trim());
    await this.timeline.getByRole('button', { name: 'Close' }).first().click();
    await expect(this.timeline).toBeHidden();
    return changes;
  }

  /**
   * Adds a note through Add Note and waits for the API to keep it. The
   * dialog's Add button stays disabled until something is typed.
   */
  async addNote(note: string): Promise<void> {
    await this.addNoteButton.click();
    const add = this.noteDialog.getByRole('button', { name: 'Add', exact: true });
    await expect(add).toBeDisabled();
    await this.noteDialog.getByRole('textbox').fill(note);
    const response = this.page.waitForResponse((r) => isOperation(r, 'CustomerUpdateRentalNote'));
    await add.click();
    const body = await (await response).json();
    const result = body.data?.customerUpdateRentalNote;
    expect(body.errors ?? result?.errors ?? [], 'CustomerUpdateRentalNote errors').toEqual([]);
    expect(result?.rental, `CustomerUpdateRentalNote answered ${JSON.stringify(body).slice(0, 300)}`).toBeTruthy();
    await expect(this.noteDialog).toBeHidden();
  }

  /**
   * The Rental Notes section, oldest first. Each note is listed with the
   * booking's status when it was written (`pending`, `confirmed`…) — notes
   * saved from Edit Booking appear here too. They come with the booking
   * (`GetRentalDetailsQuery`), so they are there once `expectLoaded` is.
   */
  async rentalNotes(): Promise<{ note: string; status: string }[]> {
    // The card, not `rct-block`: that also matches its `rct-block-title`.
    const section = this.byRole('heading', { name: 'Rental Notes' }).locator(
      'xpath=ancestor::div[contains(@class, "booking-details-card")][1]',
    );
    const items = section.getByRole('listitem');
    return items.evaluateAll((lis) =>
      lis.map((li) => {
        const [note, status] = [...li.querySelectorAll(':scope > span')].map((span) => (span as HTMLElement).innerText.trim());
        return { note: note ?? '', status: status ?? '' };
      }),
    );
  }

  /**
   * Who the booking is assigned to, or '' — the name is a bare text node after
   * the Assign To button, in the same container.
   */
  async assignedTo(): Promise<string> {
    const container = await this.assignButton.locator('xpath=..').innerText();
    return container.replace(/^\s*Assign To/, '').trim();
  }

  /**
   * Assigns the booking to a customer care user and waits for the API to
   * accept it. The user list ("Customer Care List") is radios named by the
   * user, some names repeat, so pass one that is unique. The list's Assign To
   * button is enabled before anyone is chosen; this always chooses first.
   */
  async assignTo(user: string): Promise<void> {
    await this.assignButton.click();
    const choice = this.customerCareList.locator('[role=radiogroup] > *').filter({
      has: this.page.getByText(user, { exact: true }),
    });
    await expect(choice, `customer care users named ${user}`).toHaveCount(1);
    await choice.getByText(user, { exact: true }).click();
    await expect(choice.locator('input')).toBeChecked();

    const response = this.page.waitForResponse((r) => isOperation(r, 'AssignRentalTo'));
    await this.customerCareList.getByRole('button', { name: 'Assign To' }).click();
    const sure = this.page.locator('.swal-modal');
    await expect(sure).toContainText(`Are You Sure ? You Want To Assign this Booking To ${user}`);
    await sure.getByRole('button', { name: 'Yes' }).click();

    const body = await (await response).json();
    expect(body.errors ?? body.data?.assignRentalTo?.errors ?? [], 'AssignRentalTo errors').toEqual([]);
    expect(body.data?.assignRentalTo?.status, `AssignRentalTo answered ${JSON.stringify(body)}`).toBe('success');
  }

  /** The user the Assign To dialog opens with already chosen, or '' — closes it again. */
  async preselectedAssignee(): Promise<string> {
    await this.assignButton.click();
    const rows = this.customerCareList.locator('[role=radiogroup] > *');
    await expect(rows.first()).toBeVisible();
    const chosen = rows.filter({ has: this.page.locator('input:checked') });
    const name = (await chosen.count()) ? (await chosen.innerText()).trim() : '';
    await this.customerCareList.getByRole('button', { name: 'Cancel' }).click();
    await expect(this.customerCareList).toBeHidden();
    return name;
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
      // The reason radios ignore check(); clicking the label selects them. They
      // share the name `gender1` with the status radios in the dialog still
      // open behind, and the choice occasionally does not stick, so the click
      // is repeated until it does — as a user would.
      const other = reasons.getByRole('radio', { name: 'Other:' });
      await expect(async () => {
        await reasons.getByText('Other:', { exact: true }).click();
        await expect(other).toBeChecked({ timeout: 1_000 });
      }).toPass({ timeout: 10_000 });
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
