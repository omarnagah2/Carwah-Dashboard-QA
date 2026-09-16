import { expect, type Locator, type Page } from '@playwright/test';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The panel the bookings list's Filter button opens. */
export class BookingFilters {
  readonly toggle: Locator;
  readonly customerName: Locator;
  readonly bookingNo: Locator;
  readonly nationalId: Locator;
  readonly plateNo: Locator;
  /** Local number only; the +966 prefix is its own control and is sent with it. */
  readonly mobile: Locator;
  readonly searchButton: Locator;
  readonly clearButton: Locator;
  private readonly dropdowns: Locator;

  constructor(private readonly page: Page) {
    this.toggle = page.getByRole('button', { name: 'Filter' });
    this.customerName = page.locator('#customerName');
    this.bookingNo = page.locator('#bookingNo');
    this.nationalId = page.locator('#userNid');
    this.plateNo = page.locator('#plateNo');
    this.mobile = page.locator('#input-tel');
    this.searchButton = page.getByRole('button', { name: 'Search Filter' });
    this.clearButton = page.getByRole('button', { name: 'Clear' });
    this.dropdowns = page.locator('div.dropdown-select');
  }

  async open(): Promise<void> {
    if (!(await this.customerName.isVisible())) {
      await this.toggle.click();
    }
    await expect(this.customerName).toBeVisible();
  }

  /** A dropdown's placeholder, shown only while nothing is chosen in it. */
  placeholder(name: string): Locator {
    return this.dropdowns.getByText(name, { exact: true });
  }

  /**
   * The dropdowns are react-selects with generated ids and no labels, and
   * their placeholder vanishes once something is chosen, so each is found by
   * its position among them while it still shows the placeholder. Typing
   * narrows the list — for Ally Name it is what searches the server, since only
   * ten allies are listed up front.
   */
  async choose(placeholder: string, option: string, { occurrence = 0 } = {}): Promise<void> {
    const placeholders = (await this.dropdowns.allInnerTexts()).map((text) => text.trim());
    // Agency Name appears twice, so the caller says which one.
    const index = placeholders.flatMap((text, i) => (text === placeholder ? [i] : []))[occurrence];
    expect(index, `dropdown "${placeholder}" #${occurrence} in ${placeholders.join(' | ')}`).toBeDefined();
    const dropdown = this.dropdowns.nth(index);

    await dropdown.locator('input').pressSequentially(option);
    // Every list opens with a disabled "Enter at least 4 characters" hint, so
    // the option is matched exactly.
    await this.page
      .locator('[id*="-option-"]')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(option)}\\s*$`) })
      .first()
      .click();
    // Multi-selects stay open after a choice.
    await this.page.keyboard.press('Escape');
    await expect(dropdown).toContainText(option);
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
