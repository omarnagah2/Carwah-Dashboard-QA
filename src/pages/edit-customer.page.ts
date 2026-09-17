import { expect, type Page } from '@playwright/test';
import { CustomerFormPage } from './customer-form.page';

/**
 * /cw/dashboard/customers/<id>/edit — the Add Customer form filled with the
 * customer, whose mobile cannot be changed. Specs only read it.
 */
export class EditCustomerPage extends CustomerFormPage {
  readonly heading = this.byRole('heading', { name: 'Edit Customer', level: 2 });

  constructor(page: Page) {
    super(page);
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
