import { expect, type Locator, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { BookingFormPage } from './booking-form.page';

/** What `CreateBooking` answers with, as far as specs read it. */
export interface CreatedRental {
  id: string;
  carId: string;
  branchId: string;
  pickUpDate: string;
  dropOffDate: string;
}

/**
 * Add Booking at /cw/dashboard/bookings/add: the customer is looked up by
 * mobile first, and the booking form only fills in after that.
 */
export class AddBookingPage extends BookingFormPage {
  /** An intl-tel-input that opens pre-filled with `+966`. */
  readonly mobile = this.page.getByRole('textbox', { name: '1 (702) 123-4567' });
  readonly customerDataButton = this.byRole('button', { name: 'Customer Data' });
  readonly customerDetails = this.byRole('heading', { name: 'Customer Details' });
  readonly rentButton = this.byRole('button', { name: 'Rent' });

  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.page.goto('/cw/dashboard/bookings/add', { waitUntil: 'domcontentloaded' });
    await expect(this.customerDataButton).toBeVisible();
  }

  /** `localMobile` is the number without the country code, e.g. 591593593. */
  async findCustomer(localMobile: string): Promise<void> {
    await this.mobile.click();
    await this.mobile.press('End');
    await this.mobile.pressSequentially(localMobile);
    await this.customerDataButton.click();
    await expect(this.customerDetails).toBeVisible();
  }

  async chooseCity(city: string): Promise<void> {
    await this.pickupCity.click();
    await this.byRole('option', { name: city, exact: true }).click();
    await expect(this.pickupCity).toHaveValue(city);
  }

  /**
   * Company, branch and car are react-selects under headings (spelled
   * "Selceting" on the page), and each loads only once the one before it is
   * chosen. Their placeholder covers the input, so the input is focused rather
   * than clicked.
   */
  async chooseAlly(ally: string): Promise<void> {
    await this.chooseUnder('Selceting a company', ally, { typed: ally });
  }

  async chooseBranch(branch: string): Promise<void> {
    await this.chooseUnder('Selceting a branch', branch);
  }

  /**
   * A car option reads `Manual / Suzuki - Dzire - - 2021 | [Branch Name: …]
   * [Daily: 99 …]`, and one branch can list the same model at several prices,
   * so the daily price is part of the match. Its text content has runs of
   * spaces and a line break that the screen collapses, hence `\s+`.
   */
  async chooseCar(car: string, dailyPrice: number): Promise<void> {
    const name = car.split(/\s+/).map(escapeRegExp).join('\\s+');
    await this.chooseUnder(/select car/i, new RegExp(`${name}\\s[\\s\\S]*\\[Daily:\\s*${dailyPrice}\\s`));
    await expect(this.priceHeading).toBeVisible();
  }

  /**
   * Presses Rent and returns the rental the API created. Success lands back on
   * the bookings list; there is no confirmation step.
   */
  async rent(): Promise<CreatedRental> {
    const response = this.page.waitForResponse((r) => isOperation(r, 'CreateBooking'));
    await this.rentButton.click();
    const answered = await response;
    const body = await answered.json();
    const result = body.data?.createRental;
    expect(body.errors ?? result?.errors ?? [], 'CreateBooking errors').toEqual([]);
    expect(result?.rental?.id, `CreateBooking answered ${JSON.stringify(body).slice(0, 300)}`).toBeTruthy();
    await expect(this.page).toHaveURL(/\/cw\/dashboard\/bookings$/);
    return result.rental;
  }

  private async chooseUnder(
    heading: string | RegExp,
    option: string | RegExp,
    { typed }: { typed?: string } = {},
  ): Promise<void> {
    const input: Locator = this.byRole('heading', { name: heading }).locator('xpath=following::input[1]');
    await input.focus();
    if (typed) {
      await input.pressSequentially(typed);
    } else {
      await this.page.keyboard.press('ArrowDown');
    }
    const match = typeof option === 'string' ? new RegExp(`^\\s*${escapeRegExp(option)}\\s*$`) : option;
    await this.page.locator('[id*="-option-"]').filter({ hasText: match }).first().click();
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
