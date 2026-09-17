import { expect, type Locator, type Page } from '@playwright/test';
import { escapeRegExp } from '../utils/text';

/**
 * The panel a list's Filter button opens (bookings, customers): text fields,
 * react-select dropdowns, a +966 mobile field, Search Filter and Clear.
 */
export abstract class FilterPanel {
  readonly toggle: Locator;
  /** Local number only; the +966 prefix is its own control and is sent with it. */
  readonly mobile: Locator;
  readonly searchButton: Locator;
  readonly clearButton: Locator;
  protected readonly dropdowns: Locator;

  protected constructor(protected readonly page: Page) {
    this.toggle = page.getByRole('button', { name: 'Filter' });
    this.mobile = page.locator('#input-tel');
    this.searchButton = page.getByRole('button', { name: 'Search Filter' });
    this.clearButton = page.getByRole('button', { name: 'Clear' });
    this.dropdowns = page.locator('div.dropdown-select');
  }

  /** A field that is only on screen while the panel is open. */
  protected abstract get firstField(): Locator;

  async open(): Promise<void> {
    if (!(await this.firstField.isVisible())) {
      await this.toggle.click();
    }
    await expect(this.firstField).toBeVisible();
  }

  /** A dropdown's placeholder, shown only while nothing is chosen in it. */
  placeholder(name: string): Locator {
    return this.dropdowns.getByText(name, { exact: true });
  }

  /**
   * The dropdowns are react-selects with generated ids and no labels, and
   * their placeholder vanishes once something is chosen, so each is found by
   * its position among them while it still shows the placeholder. Typing
   * narrows the list — for the bookings' Ally Name it is what searches the
   * server, since only ten allies are listed up front.
   */
  async choose(placeholder: string, option: string, { occurrence = 0 } = {}): Promise<void> {
    const placeholders = (await this.dropdowns.allInnerTexts()).map((text) => text.trim());
    // The bookings' Agency Name appears twice, so the caller says which one.
    const index = placeholders.flatMap((text, i) => (text === placeholder ? [i] : []))[occurrence];
    expect(index, `dropdown "${placeholder}" #${occurrence} in ${placeholders.join(' | ')}`).toBeDefined();
    const dropdown = this.dropdowns.nth(index);

    await dropdown.locator('input').pressSequentially(option);
    // Most lists open with a disabled "Enter at least 4 characters" hint, and
    // options can end in a space (`Blocked `), so the option is matched
    // exactly but for whitespace.
    await this.page
      .locator('[id*="-option-"]')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(option)}\\s*$`) })
      .first()
      .click();
    // Multi-selects stay open after a choice.
    await this.page.keyboard.press('Escape');
    await expect(dropdown).toContainText(option);
  }
}
