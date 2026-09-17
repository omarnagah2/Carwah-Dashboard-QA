import type { Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export type CustomerTextField = 'First Name' | 'Middle Name' | 'Last Name' | 'Email Address' | 'National ID' | 'Company Name';

export type CustomerDateField =
  | 'National ID Expiry Date - Gregorian'
  | 'Driver license Expiry Date - Gregorian'
  | 'Date Of Birth - Gregorian';

/** The form shared by Add Customer and Edit Customer. */
export abstract class CustomerFormPage extends BasePage {
  /** Named after its placeholder; opens as `+966`. */
  readonly mobile = this.byRole('textbox', { name: '512345678*' });
  readonly licenseImage = this.page.locator('#licenseFrontImage');
  readonly saveButton = this.byRole('button', { name: 'Save' });
  readonly cancelButton = this.byRole('button', { name: 'Cancel' });
  /** "Required field", "Please enter right mobile number", "This image is required". */
  readonly validationErrors = this.page.getByText(/^(Required field|Please enter right mobile number|This image is required)$/);

  protected constructor(page: Page) {
    super(page);
  }

  field(label: CustomerTextField): Locator {
    return this.byRole('textbox', { name: label, exact: true });
  }

  /**
   * A Gregorian date field, found by placeholder. The Driver license Hijri
   * field carries the Gregorian placeholder too, so the first match is taken.
   */
  dateField(label: CustomerDateField): Locator {
    return this.page.getByPlaceholder(label).first();
  }
}
