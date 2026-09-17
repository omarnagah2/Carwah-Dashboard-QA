import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * /cw/dashboard/customers/<id>/edit — the Add Customer form filled with the
 * customer, whose mobile cannot be changed. Specs only read it.
 */
export class EditCustomerPage extends BasePage {
  readonly heading = this.byRole('heading', { name: 'Edit Customer', level: 2 });
  /** Named after its placeholder; shows the number as `+966 591 593 593`. */
  readonly mobile = this.byRole('textbox', { name: '512345678*' });
  readonly saveButton = this.byRole('button', { name: 'Save' });
  readonly cancelButton = this.byRole('button', { name: 'Cancel' });

  constructor(page: Page) {
    super(page);
  }

  field(label: 'First Name' | 'Middle Name' | 'Last Name' | 'Email Address' | 'National ID' | 'Company Name'): Locator {
    return this.byRole('textbox', { name: label, exact: true });
  }

  async expectLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.field('First Name')).not.toHaveValue('', { timeout: 30_000 });
  }

  /** Leaves without saving; the form returns to the customers list. */
  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await expect(this.page).toHaveURL(/\/cw\/dashboard\/customers$/);
  }
}
