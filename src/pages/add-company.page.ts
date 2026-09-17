import { expect, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { CompanyFormPage } from './company-form.page';

/** What the add-partner spec fills in; the rest keeps the form's defaults. */
export interface NewCompany {
  arName: string;
  enName: string;
  managerName: string;
  /** Local number, without 966. */
  phoneNumber: string;
  email: string;
  allyClass: string;
  commercialRegistration: string;
  commissionRate: number;
  /** One of the Rate dropdown's names, and the Rate value beside it. */
  rate: { name: string; value: number };
  /** Used for all four required images. */
  image: string;
}

/**
 * /cw/dashboard/companies/add ("Add Company"). Defaults: not B2B, B2C, no
 * online payment, no fixed extension price, no API integration.
 */
export class AddCompanyPage extends CompanyFormPage {
  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.page.goto('/cw/dashboard/companies/add', { waitUntil: 'domcontentloaded' });
    await expect(this.addHeading).toBeVisible({ timeout: 30_000 });
    // Its mobile field starts empty (the customer form's holds "+966").
    await expect(this.field('Name (En)')).toBeVisible();
    await expect(this.mobile).toBeVisible();
  }

  async fill(company: NewCompany): Promise<void> {
    await this.field('Name (Ar)').fill(company.arName);
    await this.field('Name (En)').fill(company.enName);
    await this.field('Manager Name').fill(company.managerName);
    // An intl-tel-input: the local number goes after the +966 already in it.
    await this.mobile.press('End');
    await this.mobile.pressSequentially(company.phoneNumber);
    await this.field('Email Address').fill(company.email);
    await this.choose('Class', company.allyClass);
    await this.field('Commercial Registration').fill(company.commercialRegistration);
    await this.numberField('Commision Rate').fill(String(company.commissionRate));
    await this.choose('Rate', company.rate.name);
    await this.numberField('Rate value').fill(String(company.rate.value));
    // All four images are required; each is uploaded when Save is pressed.
    for (const field of ['#commercialRegistrationImage', '#licenceImage', '#logo', '#bankCardImage']) {
      await this.page.locator(field).setInputFiles(company.image);
    }
  }

  /**
   * Save uploads the four images (`ImageUpload`), then sends
   * `CreateAllyCompanyMutation` with their URLs and every default, and returns
   * to the partners list. Returns the new partner's id and what was sent.
   */
  async save(): Promise<{ companyId: string; sent: Record<string, unknown> }> {
    const created = this.page.waitForResponse((r) => isOperation(r, 'CreateAllyCompanyMutation'), { timeout: 60_000 });
    await this.saveButton.click();
    const response = await created;
    const body = await response.json();
    const result = body.data?.createAllyCompany;
    expect(body.errors ?? result?.errors, `CreateAllyCompanyMutation answered ${JSON.stringify(body)}`).toEqual([]);
    expect(result.status).toBe('success');
    await expect(this.page).toHaveURL(/\/cw\/dashboard\/companies$/);
    return { companyId: result.allyCompany.id, sent: response.request().postDataJSON().variables };
  }
}
