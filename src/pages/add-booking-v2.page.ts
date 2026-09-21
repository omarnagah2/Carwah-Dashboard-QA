import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { escapeRegExp } from '../utils/text';
import { BasePage } from './base.page';
import { pickDate } from './date-time-picker.component';

export type BookingType = 'Daily' | 'Monthly' | 'Rent To Own';

/** What `GetRentPrice` answers (`aboutRentPrice`), as far as specs read it. */
export interface RentPrice {
  dailyPrice: number;
  pricePerDay: number;
  numberOfDays: number;
  priceBeforeDiscount: number;
  discountValue: number;
  discountType: string | null;
  priceBeforeInsurance: number;
  priceBeforeTax: number;
  taxValue: number;
  totalPrice: number;
  totalAmountDue: number;
  addsPrice: number;
  totalExtraServicesPrice: number;
  insuranceIncluded: boolean;
  insuranceValue: number;
  deliveryPrice: number;
  handoverPrice: number;
  isUnlimitedFree: boolean;
  totalUnlimitedFee: number;
  rentToOwnInstallmentBreakdown: { firstPayment: number; monthlyInstallment: number; finalInstallment: number } | null;
  installmentsBreakdown: { amount: number; status: string }[] | null;
}

/**
 * The refactored Add Booking at /cw/dashboard/bookings/add2. The customer is
 * looked up by mobile first; then the form offers a booking type (Daily,
 * Monthly, Rent To Own), Delivery and Handover in another branch, timing,
 * location, the car, extra services, a coupon, insurance and the About price
 * summary, and **Rent**.
 *
 * Ticking Delivery or Handover **resets the city, company and car**, so they
 * are ticked first. Only the box ticks, not its label (`for`
 * without an id), so the box itself is clicked.
 */
export class AddBookingV2Page extends BasePage {
  readonly mobile = this.page.getByRole('textbox', { name: '1 (702) 123-4567' });
  readonly customerDataButton = this.byRole('button', { name: 'Customer Data' });
  readonly customerDetails = this.byRole('heading', { name: 'Customer Details' });
  readonly rentButton = this.byRole('button', { name: 'Rent' });
  readonly priceHeading = this.byRole('heading', { name: 'About price' });
  readonly deliveryLocation = this.byRole('textbox', { name: 'Enter a location' });
  readonly handoverFee = this.byRole('textbox', { name: 'Change Handover service fees' });
  readonly suggestedPrice = this.byRole('textbox', { name: 'Suggested price per day' });
  readonly installments = this.byRole('checkbox', { name: 'Installments' });
  private readonly options = this.page.locator('[id*="-option-"], [role="option"]');
  /** The latest `GetRentPrice` answer the page received. */
  private lastPrice: RentPrice | undefined;

  constructor(page: Page) {
    super(page);
    page.on('response', async (response) => {
      if (isOperation(response, 'GetRentPrice')) {
        const price = (await response.json().catch(() => null))?.data?.aboutRentPrice;
        if (price) {
          this.lastPrice = price;
        }
      }
    });
  }

  async open(): Promise<void> {
    await this.page.goto('/cw/dashboard/bookings/add2', { waitUntil: 'domcontentloaded' });
    await expect(this.customerDataButton).toBeVisible({ timeout: 30_000 });
  }

  /** `localMobile` is the number without the country code, e.g. 591593593. */
  async findCustomer(localMobile: string): Promise<void> {
    await this.mobile.click();
    await this.mobile.press('End');
    await this.mobile.pressSequentially(localMobile);
    await this.customerDataButton.click();
    await expect(this.customerDetails).toBeVisible({ timeout: 30_000 });
    await expect(this.byRole('radio', { name: 'Daily' })).toBeVisible();
  }

  async bookingType(type: BookingType): Promise<void> {
    await this.byRole('radio', { name: type, exact: true }).check();
  }

  /** The Delivery / Handover checkbox; its label is not linked to it (by design). */
  optionBox(option: 'delivery' | 'handover'): Locator {
    return this.page
      .locator('div.form-check')
      .filter({ has: this.page.locator(`label[for="${option}"]`) })
      .locator('input[type=checkbox]');
  }

  async tick(option: 'delivery' | 'handover'): Promise<void> {
    await this.optionBox(option).check();
    await expect(this.optionBox(option)).toBeChecked();
  }

  /**
   * Types a place into the delivery map's search and takes Google's first
   * suggestion. Choose the city **before** this: choosing it after moves the
   * delivery point back to the city centre (known issue).
   */
  async deliverTo(place: string): Promise<void> {
    await this.deliveryLocation.fill(place);
    const suggestion = this.page.locator('.pac-item').first();
    await expect(suggestion).toBeVisible({ timeout: 15_000 });
    await suggestion.click();
    await expect(this.deliveryLocation).not.toHaveValue(place);
  }

  async chooseCity(city: string): Promise<void> {
    await this.chooseAfter(this.byRole('heading', { name: 'Pickup City' }), city, { typed: city.length >= 4 ? city : undefined });
  }

  /** With Handover ticked, a second city dropdown ("Select...") is the drop-off city. */
  async chooseDropoffCity(city: string): Promise<void> {
    await this.chooseAfter(this.page.getByText('Select...', { exact: true }), city);
  }

  /**
   * Typed, since the list can be long. Matched by its ending: one partner's
   * name starts with a stray Arabic mark ("ِAl-nagah").
   */
  async chooseAlly(ally: string): Promise<void> {
    await this.chooseAfter(this.byRole('heading', { name: 'Selceting a company' }), new RegExp(`${escapeRegExp(ally)}\\s*$`), {
      typed: ally.slice(0, 6),
    });
  }

  /** "Selceting a branch" (sic) normally; "Selecting Pickup branch" with Handover. */
  async chooseBranch(branch: string): Promise<void> {
    const heading = this.byRole('heading', { name: /^(Selceting a branch|Selecting Pickup branch)$/ });
    await this.chooseAfter(heading, branch);
  }

  async chooseDropoffBranch(branch: string): Promise<void> {
    await this.chooseAfter(this.byRole('heading', { name: 'Selecting Dropoff branch' }), branch);
  }

  /**
   * A car option reads `Manual / Suzuki - Dzire - - 2021 | [Branch Name: …]
   * [Daily: 99 Weekly Price: 88 Monthly Price: 77]`; one branch lists the same
   * model at several prices, so the daily price is part of the match.
   */
  async chooseCar(model: string, dailyPrice: number): Promise<void> {
    const match = new RegExp(`${escapeRegExp(model)}[\\s\\S]*\\[Daily:\\s*${dailyPrice}\\s`);
    await this.chooseAfter(this.byRole('heading', { name: 'select car' }), match);
  }

  /** Standard, Full — only those the car offers are listed. */
  async insuranceOptions(): Promise<string[]> {
    const input = this.page.getByText('Select Insurance', { exact: true }).locator('xpath=following::input[1]');
    await input.focus();
    await this.page.keyboard.press('ArrowDown');
    await expect(this.options.first()).toBeVisible();
    const names = (await this.options.allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return names;
  }

  async chooseInsurance(insurance: 'Standard' | 'Full'): Promise<void> {
    await this.pricedBy(() => this.chooseAfter(this.page.getByText('Select Insurance', { exact: true }), insurance));
  }

  /** An extra service checkbox, named `<service> <price>` (`GPS 5 SAR / Rent`). */
  extraService(name: string): Locator {
    return this.byRole('checkbox', { name: new RegExp(`^${escapeRegExp(name)} (\\d+(\\.\\d+)? SAR / (Rent|Day)|Free)$`) });
  }

  async addExtraService(name: string): Promise<void> {
    await this.pricedBy(() => this.extraService(name).check());
  }

  /** Monthly bookings pick a length (One Month … Twenty Four Months); Three by default. */
  async chooseMonths(months: string): Promise<void> {
    await this.chooseAfter(this.page.getByText('Months', { exact: true }), new RegExp(`^${months}$`));
  }

  /** Rent To Own: the plans under "Choose Plan", as radios; picks the first. */
  async choosePlan(): Promise<void> {
    await this.pricedBy(() =>
      this.byRole('heading', { name: 'Choose Plan' }).locator('xpath=following::input[@type="radio"][1]').check(),
    );
  }

  /**
   * Moves the daily booking's drop-off to `date` (same time of day) with the
   * MUI date-time picker also used by Edit Booking. It opens on the current
   * drop-off, three days after pickup by default. **Changing a date clears the
   * company, branch and car** (what is offered depends on the dates), so set
   * the dates before choosing them.
   */
  async setDropoff(date: Date, current: Date): Promise<void> {
    const field = this.page.getByText('Drop off Date/Time', { exact: true }).locator('xpath=following::input[1]');
    await pickDate(this.page, field, current, date);
  }

  /** Types a coupon and presses Apply; returns the message the page shows. */
  async applyCoupon(code: string): Promise<Locator> {
    await this.byRole('textbox', { name: 'Discount Coupon' }).fill(code);
    const checked = this.page.waitForResponse((r) => isOperation(r, 'CarCouponAvailability'), { timeout: 30_000 });
    await this.byRole('button', { name: 'Apply' }).click();
    await checked;
    return this.page.getByText(/coupon/i).filter({ hasNotText: /^(Discount Coupon|Coupons)$/ });
  }

  async payOnline(): Promise<void> {
    await this.pricedBy(() => this.byRole('radio', { name: 'Online' }).check());
  }

  /** The About price summary as one line of text. */
  async summary(): Promise<string> {
    const text = (await this.priceHeading.locator('xpath=..').innerText()).replace(/\s+/g, ' ').trim();
    return text.replace(/ Paymet Method.*$/, '');
  }

  /** The latest price the page asked the API for (`GetRentPrice`). */
  price(): RentPrice {
    expect(this.lastPrice, 'a GetRentPrice answer').toBeDefined();
    return this.lastPrice!;
  }

  /**
   * Presses Rent; returns the new rental and what `CreateBooking` sent.
   * Success lands back on the bookings list with no confirmation.
   */
  async rent(): Promise<{ bookingId: string; sent: Record<string, unknown> }> {
    await expect(this.rentButton).toBeEnabled();
    const created = this.page.waitForResponse((r) => isOperation(r, 'CreateBooking'), { timeout: 60_000 });
    await this.rentButton.click();
    const response = await created;
    const body = await response.json();
    const result = body.data?.createRental;
    expect(body.errors ?? result?.errors ?? [], `CreateBooking answered ${JSON.stringify(body).slice(0, 500)}`).toEqual([]);
    expect(result?.rental?.id, `CreateBooking answered ${JSON.stringify(body).slice(0, 300)}`).toBeTruthy();
    await expect(this.page).toHaveURL(/\/cw\/dashboard\/bookings$/, { timeout: 30_000 });
    return { bookingId: String(result.rental.id), sent: response.request().postDataJSON().variables };
  }

  /** Runs `action` and waits for the reprice it triggers. */
  private async pricedBy(action: () => Promise<unknown>): Promise<Response> {
    const priced = this.page.waitForResponse((r) => isOperation(r, 'GetRentPrice'), { timeout: 30_000 });
    await action();
    const response = await priced;
    await expect(this.priceHeading).toBeVisible();
    // Let the page render the answer before it is read.
    await this.page.waitForTimeout(500);
    return response;
  }

  /**
   * The form's dropdowns are react-selects placed after a heading or label;
   * their placeholder covers the input, so it is focused, not clicked.
   */
  private async chooseAfter(anchor: Locator, option: string | RegExp, { typed }: { typed?: string } = {}): Promise<void> {
    const input = anchor.locator('xpath=following::input[1]');
    await input.focus();
    if (typed) {
      await input.pressSequentially(typed);
    } else {
      await this.page.keyboard.press('ArrowDown');
    }
    const match = typeof option === 'string' ? new RegExp(`^\\s*${escapeRegExp(option)}\\s*$`) : option;
    await this.options.filter({ hasText: match }).first().click();
  }
}
