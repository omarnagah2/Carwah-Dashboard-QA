import { expect, type Locator, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { BasePage } from './base.page';
import { pickDate } from './date-time-picker.component';
import { ExtensionRequests } from './extension-requests.component';

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
  readonly extraServicesButton = this.byRole('button', { name: 'Update Extra Service' });
  readonly extraServicesDialog = this.byRole('dialog').filter({ has: this.page.getByRole('button', { name: 'Edit', exact: true }) });
  readonly changeDurationButton = this.byRole('button', { name: 'Change Duration' });
  readonly durationDialog = this.byRole('dialog').filter({ hasText: 'Drop off Date/Time' });
  readonly updatePriceButton = this.byRole('button', { name: 'Update Price' });
  readonly suggestedPrice = this.page.getByRole('textbox', { name: 'Suggested price per day' });
  readonly priceDialog = this.byRole('dialog').filter({ has: this.suggestedPrice });
  readonly addExtraFeesButton = this.byRole('button', { name: 'Add Extra Fees' });
  readonly feeDialog = this.byRole('dialog').filter({ has: this.page.getByRole('textbox', { name: 'Extra Fees Name' }) });
  readonly extensionRequestsButton = this.byRole('button', { name: 'Extension Requests' });

  constructor(page: Page) {
    super(page);
  }

  /**
   * Opens the booking and waits until its actions are safe to use: the booking
   * itself (`expectLoaded`), then the ally, branch and car it belongs to.
   * Opening Update Extra Service before those arrive throws in the page and
   * blanks it.
   */
  async open(bookingId: string): Promise<void> {
    // Part of loading the page, so given the navigation timeout: on a slow
    // pre-prod they are not even requested for several seconds.
    const related = ['GetAllyCompanyQuery', 'Branch', 'GetCarProfile'].map((operation) =>
      this.page.waitForResponse((r) => isOperation(r, operation), { timeout: 30_000 }),
    );
    await this.page.goto(`/cw/dashboard/bookings/${bookingId}`, { waitUntil: 'domcontentloaded' });
    await this.expectLoaded();
    await Promise.all(related);
    // Branch is fetched again after those answer, and clicking before the
    // later fetches settle still blanked the page once. The page does not
    // poll, so the network going quiet marks the end of loading.
    await this.page.waitForLoadState('networkidle');
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
   * Ticks `services` in Update Extra Service (leaving the rest as they are)
   * and waits for the API to accept them. Each checkbox is named
   * `<service> <price>`, e.g. `GPS 5 SAR / Rent` or `yata Free`.
   */
  async addExtraServices(services: readonly string[]): Promise<void> {
    await this.extraServicesButton.click();
    for (const service of services) {
      await this.extraService(service).check();
    }
    const response = this.page.waitForResponse((r) => isOperation(r, 'CustomerUpdateRentalExtraServices'));
    await this.extraServicesDialog.getByRole('button', { name: 'Edit', exact: true }).click();
    const body = await (await response).json();
    const result = body.data?.customerUpdateRentalExtraServices;
    expect(body.errors ?? result?.errors ?? [], 'CustomerUpdateRentalExtraServices errors').toEqual([]);
    expect(result?.status, `CustomerUpdateRentalExtraServices answered ${JSON.stringify(body)}`).toBe('success');
    await expect(this.extraServicesDialog).toBeHidden();
  }

  /** The services Update Extra Service opens with ticked, by name — closes it again. */
  async chosenExtraServices(): Promise<string[]> {
    await this.extraServicesButton.click();
    const boxes = this.extraServicesDialog.getByRole('checkbox');
    await expect(boxes.first()).toBeVisible();
    const chosen: string[] = [];
    for (const box of await boxes.all()) {
      if (await box.isChecked()) {
        const label = (await box.getAttribute('aria-label')) ?? (await box.evaluate((e) => (e as HTMLInputElement).labels?.[0]?.innerText ?? ''));
        chosen.push(label.replace(/\s+(\d+(\.\d+)? SAR \/ (Rent|Day)|Free)$/, '').trim());
      }
    }
    await this.extraServicesDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(this.extraServicesDialog).toBeHidden();
    return chosen;
  }

  private extraService(service: string): Locator {
    return this.extraServicesDialog.getByRole('checkbox', {
      name: new RegExp(`^${escapeRegExp(service)} (\\d+(\\.\\d+)? SAR / (Rent|Day)|Free)$`),
    });
  }

  /**
   * Moves the drop-off from `current` to `date` through Change Duration (the
   * pickup stays) and waits for the API to accept it. The dialog's dates are
   * in Arabic; there is no confirmation step.
   */
  async changeDropoff(current: Date, date: Date): Promise<void> {
    await this.changeDurationButton.click();
    const dropoff = this.durationDialog.getByText('Drop off Date/Time', { exact: true }).locator('xpath=..').getByRole('textbox');
    await pickDate(this.page, dropoff, current, date);
    const response = this.page.waitForResponse((r) => isOperation(r, 'EditRentalDuration'));
    await this.durationDialog.getByRole('button', { name: 'Change', exact: true }).click();
    const body = await (await response).json();
    const result = body.data?.editRentalDuration;
    expect(body.errors ?? result?.errors ?? [], 'EditRentalDuration errors').toEqual([]);
    expect(result?.status, `EditRentalDuration answered ${JSON.stringify(body)}`).toBe('success');
    await expect(this.durationDialog).toBeHidden();
  }

  /**
   * Sets a suggested price per day through Update Price and waits for the API
   * to accept it. The field opens empty even when a price was set before.
   */
  async updatePrice(pricePerDay: number): Promise<void> {
    await this.updatePriceButton.click();
    await expect(this.suggestedPrice).toHaveValue('');
    await this.suggestedPrice.fill(String(pricePerDay));
    const response = this.page.waitForResponse((r) => isOperation(r, 'EditSuggestedPrice'));
    await this.priceDialog.getByRole('button', { name: 'Edit', exact: true }).click();
    const body = await (await response).json();
    const result = body.data?.editSuggestedPrice;
    expect(body.errors ?? result?.errors ?? [], 'EditSuggestedPrice errors').toEqual([]);
    expect(result?.status, `EditSuggestedPrice answered ${JSON.stringify(body)}`).toBe('success');
    await expect(this.priceDialog).toBeHidden();
  }

  /**
   * Charges a fee through Add Extra Fees and waits for the API to accept it.
   * Add stays disabled until name, amount and note are all filled. The button
   * is also offered on a closed booking, where the API refuses the fee
   * ("Invalid rental status").
   */
  async addExtraFee({ name, amount, note }: { name: string; amount: number; note: string }): Promise<void> {
    await this.addExtraFeesButton.click();
    const add = this.feeDialog.getByRole('button', { name: 'Add', exact: true });
    await this.feeDialog.getByRole('textbox', { name: 'Extra Fees Name' }).fill(name);
    await this.feeDialog.getByRole('textbox', { name: 'Extra Fees Amount' }).fill(String(amount));
    await expect(add, 'Add without a note').toBeDisabled();
    await this.feeDialog.locator('textarea').fill(note);
    const response = this.page.waitForResponse((r) => isOperation(r, 'AddExtraFee'));
    await add.click();
    const body = await (await response).json();
    const result = body.data?.addExtraFee;
    // A successful answer carries `errors: null`.
    expect(body.errors ?? result?.errors ?? [], 'AddExtraFee errors').toEqual([]);
    expect(result?.status, `AddExtraFee answered ${JSON.stringify(body)}`).toBe('success');
    await expect(this.feeDialog).toBeHidden();
  }

  async extensionRequests(): Promise<ExtensionRequests> {
    await this.extensionRequestsButton.click();
    const requests = new ExtensionRequests(this.page);
    await requests.expectOpen();
    return requests;
  }

  /**
   * A figure from the details page's About Price card, e.g. `Due Amount` or an
   * extra service's charge. Its lines read `<label> <amount>`.
   */
  async aboutPrice(label: string): Promise<number> {
    const card = this.byRole('heading', { name: 'About Price' }).locator(
      'xpath=ancestor::div[contains(@class, "booking-details-card")][1]',
    );
    // Label then amount only, so `Total` does not match `Total days (4)`.
    const line = card
      .getByRole('listitem')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*-?\\d+(\\.\\d+)?\\s*$`) })
      .first();
    const numbers = (await line.innerText()).match(/-?\d+(\.\d+)?/g) ?? [];
    expect(numbers.length, `About Price line "${label}"`).toBeGreaterThan(0);
    return Number(numbers[numbers.length - 1]);
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
