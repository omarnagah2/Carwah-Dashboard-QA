import { expect, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { BookingFormPage } from './booking-form.page';
import { pickDate } from './date-time-picker.component';

/**
 * Edit Booking at /cw/dashboard/bookings/<id>/edit: the Add Booking form,
 * filled with the booking, plus a Note and Save. Only offered while the
 * booking is pending or confirmed.
 */
export class EditBookingPage extends BookingFormPage {
  readonly heading = this.byRole('heading', { name: 'Edit Booking' });
  readonly note = this.page.getByRole('textbox', { name: 'Note' });
  readonly saveButton = this.byRole('button', { name: 'Save' });
  /**
   * Read-only; opens the date-time picker. Reached through the Edit button it
   * shows the date in Arabic.
   */
  readonly dropoff = this.page.getByText('Drop off Date/Time', { exact: true }).locator('xpath=..').getByRole('textbox');

  constructor(page: Page) {
    super(page);
  }

  async expectLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.priceHeading).toBeVisible();
    await expect(this.dropoff).not.toHaveValue('');
  }

  /** Moves the drop-off from `current` to `date`, keeping the time. */
  async setDropoffDate(current: Date, date: Date): Promise<void> {
    await pickDate(this.page, this.dropoff, current, date);
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
