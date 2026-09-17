import { expect, type Locator, type Page } from '@playwright/test';
import { FilterPanel } from './filter-panel.component';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The panel the bookings list's Filter button opens. */
export class BookingFilters extends FilterPanel {
  readonly customerName: Locator;
  readonly bookingNo: Locator;
  readonly nationalId: Locator;
  readonly plateNo: Locator;

  constructor(page: Page) {
    super(page);
    this.customerName = page.locator('#customerName');
    this.bookingNo = page.locator('#bookingNo');
    this.nationalId = page.locator('#userNid');
    this.plateNo = page.locator('#plateNo');
  }

  protected get firstField(): Locator {
    return this.customerName;
  }

  /**
   * The date fields open a react-modern-calendar-datepicker on the current
   * month. Its grid also holds the neighbouring months, hidden, so the day is
   * taken by its full label and must be visible.
   */
  async pickDate(label: 'Pick Up Date' | 'Dropoff Date', date: Date): Promise<void> {
    const field = this.page.locator('.custom-textfield').filter({ hasText: label });
    await field.locator('input').click();
    const dayLabel = `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    await this.page
      .getByRole('gridcell', { name: new RegExp(`, ${dayLabel}$`) })
      .filter({ visible: true })
      .click();
    await expect(field.locator('input')).toHaveValue(formatDate(date));
  }
}

/** How the filter shows and sends a date: DD/MM/YYYY. */
export function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}
