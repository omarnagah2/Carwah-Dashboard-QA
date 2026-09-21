import { expect, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { AddBookingV2Page } from './add-booking-v2.page';

/** What the edit page loads the booking from (`GetRentalDetailsQuery`), as far as specs read it. */
export interface EditedRental {
  id: string;
  pickUpDate: string;
  dropOffDate: string;
  carId: string;
  branchId: string;
  numberOfDays: number;
  totalBookingPrice: number;
}

/**
 * The refactored Edit Booking at /cw/dashboard/bookings/<id>/edit2, for
 * bookings made on /bookings/add2. It is the Add Booking v2 form filled in
 * with the booking — the same headings and dropdowns — plus the status
 * buttons at the top, a Note and **Save**; the customer is already chosen.
 *
 * As on add2, **changing a date clears the company, branch and car**, and
 * after choosing a car **Save stays disabled until an insurance is chosen**.
 * Unlike add2 the insurance dropdown has no "Select Insurance" label; it is
 * the one after the coupon.
 */
export class EditBookingV2Page extends AddBookingV2Page {
  readonly saveButton = this.byRole('button', { name: 'Save' });
  readonly note = this.page.locator('#note');

  constructor(page: Page) {
    super(page);
  }

  /** Opens the booking's edit page and returns the booking it was filled from. */
  async openBooking(bookingId: string): Promise<EditedRental> {
    const loaded = this.page.waitForResponse((r) => isOperation(r, 'GetRentalDetailsQuery'), { timeout: 30_000 });
    await this.page.goto(`/cw/dashboard/bookings/${bookingId}/edit2`, { waitUntil: 'domcontentloaded' });
    const rental = (await (await loaded).json()).data.rentalDetails as EditedRental;
    await expect(this.saveButton).toBeVisible({ timeout: 30_000 });
    // The form fills in over a dozen queries (companies, branches, cars twice
    // over); acting before they settle reverts the choice.
    await this.page.waitForLoadState('networkidle');
    await expect(this.carValue()).toBeVisible();
    return rental;
  }

  /** The car dropdown's current value. */
  carValue() {
    return this.byRole('heading', { name: 'select car' }).locator('xpath=following::*[contains(@class, "singleValue")][1]');
  }

  override async chooseInsurance(insurance: 'Standard' | 'Full'): Promise<void> {
    await this.pricedBy(() => this.chooseAfter(this.page.locator('#CouponCode'), insurance));
  }

  async removeExtraService(name: string): Promise<void> {
    await this.pricedBy(() => this.extraService(name).uncheck());
  }

  /**
   * Presses Save; returns what `EditBooking` sent and the rental it answered
   * with. The page stays on the edit page, with no toast.
   */
  async save(): Promise<{ sent: Record<string, unknown>; rental: Record<string, unknown> }> {
    await expect(this.saveButton).toBeEnabled();
    const saved = this.page.waitForResponse((r) => isOperation(r, 'EditBooking'), { timeout: 60_000 });
    await this.saveButton.click();
    const response = await saved;
    const body = await response.json();
    const result = body.data?.editRental;
    expect(body.errors ?? result?.errors ?? [], `EditBooking answered ${JSON.stringify(body).slice(0, 500)}`).toEqual([]);
    expect(result?.status, `EditBooking answered ${JSON.stringify(body).slice(0, 300)}`).toBe('success');
    return { sent: response.request().postDataJSON().variables, rental: result.rental };
  }
}
