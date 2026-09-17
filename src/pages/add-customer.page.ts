import { expect, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { CustomerFormPage } from './customer-form.page';
import { pickCalendarDate } from './date-time-picker.component';

/** What the add-customer spec fills in; everything else keeps its default. */
export interface NewCustomer {
  firstName: string;
  lastName: string;
  email: string;
  /** Local number, without 966. */
  mobile: string;
  nationalId: string;
  nationalIdExpiry: Date;
  licenseExpiry: Date;
  birthDate: Date;
  /** The driver licence image, the only required upload. */
  licenseImage: string;
}

/**
 * /cw/dashboard/customers/add. Defaults: Male, Citizen, Unblocked, no
 * agencies, Active, Basic member.
 */
export class AddCustomerPage extends CustomerFormPage {
  readonly heading = this.byRole('heading', { name: 'Add Customer', level: 2 });

  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.page.goto('/cw/dashboard/customers/add', { waitUntil: 'domcontentloaded' });
    await expect(this.heading).toBeVisible({ timeout: 30_000 });
    // The +966 prefix is written in once the phone input is ready.
    await expect(this.mobile).toHaveValue('+966');
  }

  async fill(customer: NewCustomer): Promise<void> {
    await this.field('First Name').fill(customer.firstName);
    await this.field('Last Name').fill(customer.lastName);
    await this.field('Email Address').fill(customer.email);
    // An intl-tel-input: the local number goes after the +966 already in it.
    await this.mobile.press('End');
    await this.mobile.pressSequentially(customer.mobile);
    await this.field('National ID').fill(customer.nationalId);
    await pickCalendarDate(this.page, this.dateField('National ID Expiry Date - Gregorian'), customer.nationalIdExpiry);
    await pickCalendarDate(this.page, this.dateField('Driver license Expiry Date - Gregorian'), customer.licenseExpiry);
    await pickCalendarDate(this.page, this.dateField('Date Of Birth - Gregorian'), customer.birthDate);
    await this.licenseImage.setInputFiles(customer.licenseImage);
  }

  /**
   * Save uploads the licence image first (`ImageUpload`, a secure upload
   * answered with its S3 URL), then sends `AddCustomerMutation` with that URL
   * and returns to the customers list. Returns the new customer's id and what
   * was sent.
   */
  async save(): Promise<{ customerId: string; sent: Record<string, unknown> }> {
    const uploaded = this.page.waitForResponse((r) => isOperation(r, 'ImageUpload'), { timeout: 30_000 });
    const added = this.page.waitForResponse((r) => isOperation(r, 'AddCustomerMutation'), { timeout: 60_000 });
    await this.saveButton.click();

    const upload = (await (await uploaded).json()).data?.secureUploadImage?.imageUpload;
    expect(upload?.imageUrl, 'the licence image upload').toContain('/licenseFrontImage/');
    const response = await added;
    const body = await response.json();
    const result = body.data?.addCustomer;
    expect(body.errors ?? result?.errors, `AddCustomerMutation answered ${JSON.stringify(body)}`).toEqual([]);
    expect(result.status).toBe('success');
    await expect(this.page).toHaveURL(/\/cw\/dashboard\/customers$/);
    return { customerId: result.user.id, sent: response.request().postDataJSON().variables };
  }
}
