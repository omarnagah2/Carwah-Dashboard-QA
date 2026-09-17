import { expect, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { escapeRegExp } from '../utils/text';
import { CustomerFormPage } from './customer-form.page';

/**
 * /cw/dashboard/customers/<id>/edit — the Add Customer form filled with the
 * customer, whose mobile cannot be changed.
 */
export class EditCustomerPage extends CustomerFormPage {
  readonly heading = this.byRole('heading', { name: 'Edit Customer', level: 2 });
  /** The form's react-selects: gender, type, blocking, agencies, active, class. */
  private readonly dropdowns = this.page.locator('div.dropdown-select');

  constructor(page: Page) {
    super(page);
  }

  async expectLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.field('First Name')).not.toHaveValue('', { timeout: 30_000 });
    // The dates (and their Hijri twins) are filled in after the names; saving
    // before that is refused with "Required field".
    await expect(this.dateField('Date Of Birth - Gregorian')).not.toHaveValue('');
    await expect(this.page.getByPlaceholder('Date Of Birth - Hijri')).not.toHaveValue('');
  }

  /** What each dropdown shows, in order (`Male`, `Citizen`, … `Basic member`). */
  async dropdownValues(): Promise<string[]> {
    return (await this.dropdowns.allInnerTexts()).map((text) => text.trim());
  }

  /**
   * The dropdowns have no labels, so one is found by the value it shows now.
   */
  async choose(current: string, option: string): Promise<void> {
    const values = await this.dropdownValues();
    const index = values.indexOf(current);
    expect(index, `a dropdown showing "${current}" among ${values.join(' | ')}`).toBeGreaterThanOrEqual(0);
    await this.dropdowns.nth(index).click();
    await this.page
      .locator('[id*="-option-"]')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(option)}\\s*$`) })
      .click();
    // While focused it also holds a screen-reader note ("option … selected").
    await expect(this.dropdowns.nth(index)).toContainText(option);
  }

  /** Leaves without saving; the form returns to the customers list. */
  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await expect(this.page).toHaveURL(/\/cw\/dashboard\/customers$/);
  }

  /**
   * Save sends `EditCustomerMutation` with the whole form (and `userId`) —
   * the licence image goes back as the signed URL it was loaded with, no new
   * upload — and returns to the customers list. Returns what was sent.
   */
  async save(): Promise<Record<string, unknown>> {
    const edited = this.page.waitForResponse((r) => isOperation(r, 'EditCustomerMutation'), { timeout: 30_000 });
    await this.saveButton.click();
    // A refused form sends nothing; say why instead of waiting it out.
    const refused = this.validationErrors
      .or(this.page.getByText(/^(Min\. 1, Max\. 100 character|ID must start with .*)$/))
      .first();
    const outcome = await Promise.race([edited, refused.waitFor({ timeout: 30_000 }).then(() => null)]);
    if (!outcome) {
      const invalid = await this.page.locator('input[aria-invalid="true"]').evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).placeholder || input.id),
      );
      throw new Error(`Edit Customer refused to save: "${await refused.innerText()}" (invalid: ${invalid.join(', ')})`);
    }
    const response = outcome;
    const body = await response.json();
    const result = body.data?.editCustomer;
    expect(body.errors ?? result?.errors, `EditCustomerMutation answered ${JSON.stringify(body)}`).toEqual([]);
    expect(result.status).toBe('success');
    await expect(this.page).toHaveURL(/\/cw\/dashboard\/customers$/);
    return response.request().postDataJSON().variables;
  }
}
