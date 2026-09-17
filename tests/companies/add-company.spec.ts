import type { Page } from '@playwright/test';
import { authFile } from '../../src/config/auth';
import { testData } from '../../src/config/test-data';
import { expect, prepareContext, test } from '../../src/fixtures/test';
import { AddCompanyPage } from '../../src/pages/add-company.page';
import { CompaniesPage } from '../../src/pages/companies.page';
import { CompanyDetailsPage } from '../../src/pages/company-details.page';
import { CompanyFormPage } from '../../src/pages/company-form.page';

/**
 * Adds one real partner to pre-prod. **Partners cannot be deleted**, so every
 * run would leave an inactive `Automated Ally …` behind — which is why this
 * spec is **kept out of ordinary runs** by its `@creates-partner` tag
 * (see the config) and is only run on purpose:
 *
 *     RUN_CREATE_PARTNER=1 npx playwright test --grep @creates-partner
 *
 * Everything after creation — activating, editing, deactivating — is covered
 * by `company-edit.spec.ts` against the partner this spec already made.
 * Serial and never retried; afterAll deactivates the new partner even if a
 * step fails.
 */
test.describe('add a partner', { tag: '@creates-partner' }, () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  const company = testData.companies.newCompany();
  const phoneNumber = `966${company.phoneNumber}`;
  let companyId = '';
  let deactivated = false;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ storageState: authFile });
    await prepareContext(page.context());
  });

  test.afterAll(async () => {
    if (companyId && !deactivated) {
      console.log(`Deactivating partner ${companyId} left behind by a failed step`);
      const companies = new CompaniesPage(page);
      await companies.open();
      await companies.filters.open();
      await companies.filters.email.fill(company.email);
      await companies.search();
      await companies.setActive(companyId, false);
    }
    await page.context().close();
  });

  test('add a partner', async () => {
    const form = new AddCompanyPage(page);
    await form.open();
    await expect(form.saveButton).toBeDisabled();

    await form.fill(company);
    await expect(form.saveButton).toBeEnabled();
    const { companyId: id, sent } = await form.save();
    companyId = id;
    console.log(`Added partner ${companyId} (${company.enName})`);
    test.info().annotations.push({ type: 'created partner', description: `${companyId} (${company.enName})` });

    expect(sent).toMatchObject({
      arName: company.arName,
      enName: company.enName,
      managerName: company.managerName,
      phoneNumber,
      email: company.email,
      allyClass: company.allyClass,
      commercialRegestration: company.commercialRegistration,
      commisionRate: company.commissionRate,
      rate: company.rate.value,
      // The form's defaults.
      isB2c: true,
      isB2b: false,
      isOnlinePayEnable: false,
      isExtendFixedPrice: false,
      isApiIntegrated: false,
      canHandoverInAntherCity: false,
    });
    // All four images are uploaded and sent by URL.
    for (const field of ['licenceImage', 'logo', 'commercialRegistrationImage', 'bankCardImage'] as const) {
      expect(sent[field], field).toEqual(expect.stringContaining('/image_upload/'));
    }
  });

  test('it is listed first, active', async () => {
    const companies = new CompaniesPage(page);
    const { companies: listed } = await companies.open();

    // Partners are listed newest first.
    expect(listed[0].id).toBe(companyId);
    expect(await companies.listedCompany(companyId)).toMatchObject({
      'Ally Name': company.enName,
      'Manager Name': company.managerName,
      'phone Number': phoneNumber,
      Status: CompaniesPage.statusLabel(true),
      Class: company.allyClass,
      Email: company.email,
    });
    await expect(companies.activeSwitch(companyId)).toBeChecked();
  });

  test('its details show what was entered', async () => {
    const details = new CompanyDetailsPage(page);
    const profile = await details.open(companyId);

    expect(profile).toMatchObject({
      enName: company.enName,
      arName: company.arName,
      email: company.email,
      phoneNumber,
      allyClass: company.allyClass,
      managerName: company.managerName,
      commercialRegestration: company.commercialRegistration,
      isActive: true,
    });
    expect(await details.detail('Ally Name')).toBe(company.enName);
    expect(await details.detail('Email Address')).toBe(company.email);
    expect(await details.detail('Mobile number.')).toBe(phoneNumber);
    expect(await details.detail('Ally Class')).toBe(company.allyClass);
    expect(await details.detail('Manager Name')).toBe(company.managerName);
    expect(await details.detail('Ally Rating')).toBe(company.rate.name);
    expect(await details.detail('ally.status')).toBe('Active');
    expect(await details.setting('Enable Online Payment')).toBe(false);
    expect(await details.setting('B2B (Carwah business)')).toBe(false);
    // ✗ beside "Not B2C": the partner does serve B2C, the form's default.
    expect(await details.setting('Not B2C')).toBe(false);
    expect(await details.setting('Extend - rental fixed price')).toBe(false);
  });

  test('its edit form is filled in', async () => {
    const form = new CompanyFormPage(page);
    await form.openEdit(companyId);

    await expect(form.field('Name (En)')).toHaveValue(company.enName);
    await expect(form.field('Name (Ar)')).toHaveValue(company.arName);
    await expect(form.field('Manager Name')).toHaveValue(company.managerName);
    await expect(form.field('Email Address')).toHaveValue(company.email);
    await expect(form.field('Commercial Registration')).toHaveValue(company.commercialRegistration);
    await expect(form.mobile).toHaveValue(company.phoneNumber);
    await expect(form.numberField('Commision Rate')).toHaveValue(String(company.commissionRate));
    await expect(form.numberField('Rate value')).toHaveValue(String(company.rate.value));
    await expect(form.saveButton).toBeDisabled();
    await form.cancel();
  });

  test('deactivate the partner', async () => {
    const companies = new CompaniesPage(page);
    await companies.open();

    await companies.setActive(companyId, false);
    deactivated = true;

    expect((await companies.listedCompany(companyId)).Status).toBe(CompaniesPage.statusLabel(false));
  });

  test('the deactivated partner is found by the Inactive filter', async () => {
    const companies = new CompaniesPage(page);
    await companies.open();
    await companies.filters.open();
    await companies.filters.choose('Status', 'Inactive');

    const { companies: found } = await companies.search();

    const listed = found.find((c) => c.id === companyId);
    expect(listed, `partner ${companyId} among the inactive ones`).toBeDefined();
    expect(listed!.isActive).toBe(false);
    expect(await new CompanyDetailsPage(page).open(companyId)).toMatchObject({ isActive: false });
  });
});
