import { expect, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { BookingFormPage } from './booking-form.page';

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/**
 * Edit Booking at /cw/dashboard/bookings/<id>/edit: the Add Booking form,
 * filled with the booking, plus a Note and Save. Only offered until the
 * booking is closed.
 */
export class EditBookingPage extends BookingFormPage {
  readonly heading = this.byRole('heading', { name: 'Edit Booking' });
  readonly note = this.page.getByRole('textbox', { name: 'Note' });
  readonly saveButton = this.byRole('button', { name: 'Save' });
  /** A read-only field that opens a MUI date-time picker dialog. */
  readonly dropoff = this.page.getByText('Drop off Date/Time', { exact: true }).locator('xpath=..').getByRole('textbox');
  readonly picker = this.page.locator('.MuiPickersModal-dialogRoot');

  constructor(page: Page) {
    super(page);
  }

  async expectLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.priceHeading).toBeVisible();
    await expect(this.dropoff).not.toHaveValue('');
  }

  /**
   * Moves the drop-off from `current` to `date`, keeping the time.
   *
   * Reached through the Edit button, the dates and this picker render in
   * Arabic — month names and digits — on the English dashboard, so nothing
   * here reads the picker's labels: months are stepped by count with the
   * (always English) arrow buttons, and the day is matched in either digit
   * set. The grid pads with the neighbouring months' days, which carry a
   * `hidden` class and are skipped.
   */
  async setDropoffDate(current: Date, date: Date): Promise<void> {
    await this.dropoff.click();
    await expect(this.picker).toBeVisible();
    const months = (date.getFullYear() - current.getFullYear()) * 12 + date.getMonth() - current.getMonth();
    expect(months, 'the new drop-off must not be before the current one').toBeGreaterThanOrEqual(0);
    for (let step = 0; step < months; step++) {
      await this.picker.getByRole('button', { name: 'Next month' }).click();
    }
    const day = String(date.getDate());
    const arabicDay = [...day].map((digit) => ARABIC_DIGITS[Number(digit)]).join('');
    await this.picker
      .locator('button:has(p):not([class*="hidden"])')
      .filter({ hasText: new RegExp(`^(${day}|${arabicDay})$`) })
      .click();
    await this.picker.getByRole('button', { name: 'OK' }).click();
    await expect(this.picker).toBeHidden();
  }

  /** Saves and waits for the API to accept the edit. The page stays put. */
  async save(): Promise<void> {
    const response = this.page.waitForResponse((r) => isOperation(r, 'EditBooking'));
    await this.saveButton.click();
    const body = await (await response).json();
    const result = body.data?.editRental;
    expect(body.errors ?? result?.errors ?? [], 'EditBooking errors').toEqual([]);
    expect(result?.rental, `EditBooking answered ${JSON.stringify(body).slice(0, 300)}`).toBeTruthy();
  }
}
