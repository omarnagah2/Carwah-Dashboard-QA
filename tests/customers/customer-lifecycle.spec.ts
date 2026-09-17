import type { Page } from '@playwright/test';
import { authFile } from '../../src/config/auth';
import { testData } from '../../src/config/test-data';
import { expect, prepareContext, test } from '../../src/fixtures/test';
import { AddCustomerPage } from '../../src/pages/add-customer.page';
import { CustomerDetailsPage } from '../../src/pages/customer-details.page';
import { CustomersPage } from '../../src/pages/customers.page';
import { EditCustomerPage } from '../../src/pages/edit-customer.page';
import { isOperation } from '../../src/utils/graphql';

/** How the details page shows a date: YYYY-MM-DD. */
function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** How the form fills a date field and the API is sent it. */
function dayMonthYear(date: Date, separator: string): string {
  return isoDate(date).split('-').reverse().join(separator);
}

/**
 * The form refuses to save an empty customer, so nothing is written.
 */
test('add customer: an empty form is refused before anything is sent', async ({ page }) => {
  const form = new AddCustomerPage(page);
  await form.open();
  const mutations: string[] = [];
  page.on('request', (request) => {
    const body = request.url().includes('/graphql') ? request.postDataJSON() : null;
    if (typeof body?.query === 'string' && body.query.trimStart().startsWith('mutation')) {
      mutations.push(body.operationName);
    }
  });

  await form.saveButton.click();

  // Names, email, national ID and the dates — the Hijri twins of the dates
  // are flagged too, though they fill themselves in — plus the mobile and the
  // licence image.
  await expect(form.validationErrors.filter({ hasText: 'Required field' })).toHaveCount(9);
  for (const field of ['First Name', 'Last Name', 'Email Address', 'National ID'] as const) {
    await expect(form.field(field)).toHaveAttribute('aria-invalid', 'true');
  }
  await expect(form.validationErrors.filter({ hasText: 'Please enter right mobile number' })).toBeVisible();
  await expect(form.validationErrors.filter({ hasText: 'This image is required' })).toBeVisible();
  await expect(page).toHaveURL(/\/customers\/add$/);
  expect(mutations).toEqual([]);
});

/**
 * Writes to pre-prod: every run adds one real customer and deletes it at the
 * end (as agreed with the suite's owner). Serial and never retried — a retry
 * would add another. If a step fails, the customer is still deleted in
 * afterAll.
 */
test.describe('customer lifecycle', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  const customer = testData.customers.newCustomer();
  const mobile = `966${customer.mobile}`;
  const name = `${customer.firstName} ${customer.lastName}`;
  let customerId = '';
  let deleted = false;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ storageState: authFile });
    await prepareContext(page.context());
  });

  test.afterAll(async () => {
    if (customerId && !deleted) {
      console.log(`Deleting customer ${customerId} left behind by a failed step`);
      const customers = new CustomersPage(page);
      await customers.open();
      await customers.findByMobile(customer.mobile);
      await customers.deleteCustomer(customerId);
    }
    await page.context().close();
  });

  test('the new customer’s mobile is unused', async () => {
    const customers = new CustomersPage(page);
    await customers.open();
    expect(await customers.findByMobile(customer.mobile), `customers with mobile ${mobile}`).toEqual([]);
  });

  test('add a customer', async () => {
    const form = new AddCustomerPage(page);
    await form.open();
    await form.fill(customer);

    const { customerId: id, sent } = await form.save();
    customerId = id;
    console.log(`Added customer ${customerId} (${mobile})`);
    test.info().annotations.push({ type: 'created customer', description: `${customerId} (${mobile})` });

    expect(sent).toMatchObject({
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      mobile,
      nid: customer.nationalId,
      nationalIdExpireAt: dayMonthYear(customer.nationalIdExpiry, '/'),
      driverLicenseExpireAt: dayMonthYear(customer.licenseExpiry, '/'),
      dob: dayMonthYear(customer.birthDate, '/'),
      // The form's defaults.
      gender: 'male',
      status: 'citizen',
      isActive: true,
      customerClass: 'basic_member',
      blockingStatus: null,
      agencies: [],
    });
    expect(sent.licenseFrontImage).toContain('/licenseFrontImage/');
  });

  test('it is listed', async () => {
    const customers = new CustomersPage(page);
    await customers.open();
    const found = await customers.findByMobile(customer.mobile);

    expect(found.map((c) => c.id)).toEqual([customerId]);
    expect(await customers.listedCustomer(customerId)).toMatchObject({
      'Customer Name': name,
      'Customer phone number': mobile,
      'Customer email': customer.email,
      'Customer Status': 'Active',
    });
  });

  test('its details show what was entered', async () => {
    const details = new CustomerDetailsPage(page);
    await details.open(customerId);

    const expected: Record<string, string> = {
      'First name': customer.firstName,
      'Last Name': customer.lastName,
      'Email address': customer.email,
      'Mobile Number': mobile,
      'User Type': 'Citizen',
      Status: 'Active',
      'Date of Birth (Gregorian)': isoDate(customer.birthDate),
      Gender: 'Male',
      'Driver license Expiry Date - Gregorian': isoDate(customer.licenseExpiry),
      'Customer Class': 'Basic Member',
      'National ID': customer.nationalId,
    };
    for (const [label, value] of Object.entries(expected)) {
      expect(await details.detail(label), label).toBe(value);
    }
  });

  test('its edit form is filled in', async () => {
    const details = new CustomerDetailsPage(page);
    await details.edit();
    const form = new EditCustomerPage(page);
    await form.expectLoaded();

    await expect(form.field('First Name')).toHaveValue(customer.firstName);
    await expect(form.field('Last Name')).toHaveValue(customer.lastName);
    await expect(form.field('Email Address')).toHaveValue(customer.email);
    await expect(form.field('National ID')).toHaveValue(customer.nationalId);
    await expect(form.dateField('National ID Expiry Date - Gregorian')).toHaveValue(dayMonthYear(customer.nationalIdExpiry, '-'));
    await expect(form.dateField('Driver license Expiry Date - Gregorian')).toHaveValue(dayMonthYear(customer.licenseExpiry, '-'));
    await expect(form.dateField('Date Of Birth - Gregorian')).toHaveValue(dayMonthYear(customer.birthDate, '-'));
    await form.cancel();
  });

  test('delete the customer', async () => {
    const customers = new CustomersPage(page);
    await customers.open();
    await customers.findByMobile(customer.mobile);

    await customers.deleteCustomer(customerId);
    deleted = true;

    // The list reloads with the same search, which no longer finds them.
    await expect(customers.noRecords).toBeVisible();
    expect(await customers.total()).toBe(0);
  });

  test('a deleted customer keeps a details page, marked Deleted', async () => {
    const details = new CustomerDetailsPage(page);
    const loaded = page.waitForResponse((r) => isOperation(r, 'GetCustomerDetailsQuery'), { timeout: 30_000 });
    await details.open(customerId);

    const profile = (await (await loaded).json()).data.user.customerProfile;
    expect(profile.isDeleted).toBe(true);
    expect(await details.detail('Status')).toBe('Deleted');
    expect(await details.detail('Mobile Number')).toBe(mobile);
  });
});
