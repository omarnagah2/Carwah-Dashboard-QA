import type { Page, Request } from '@playwright/test';
import { expect, test } from '../../src/fixtures/test';
import { testData } from '../../src/config/test-data';
import { CustomerDetailsPage } from '../../src/pages/customer-details.page';
import { CustomersPage, type ListedCustomer } from '../../src/pages/customers.page';
import { EditCustomerPage } from '../../src/pages/edit-customer.page';
import { isOperation } from '../../src/utils/graphql';

const { testCustomerMobile, broadNationalId } = testData.customers;

const COLUMNS = ['#', 'Customer ID', 'Customer Name', 'Customer phone number', 'Customer email', 'Bookings', 'Created date', 'Customer Status', 'Actions'];

/** How the details page names a customer's `status`. */
const USER_TYPES: Record<string, string> = {
  citizen: 'Citizen',
  resident: 'Resident',
  gulf_citizen: 'Gulf citizen',
  visitor: 'Visitor',
};

/** Records every mutation the page sends, so read-only specs can prove they wrote nothing. */
function recordMutations(page: Page): string[] {
  const mutations: string[] = [];
  page.on('request', (request: Request) => {
    const body = request.url().includes('/graphql') ? request.postDataJSON() : null;
    if (typeof body?.query === 'string' && body.query.trimStart().startsWith('mutation')) {
      mutations.push(body.operationName);
    }
  });
  return mutations;
}

/**
 * Read-only: the specs look up the bookings' dedicated test customer and
 * never save, delete or change anyone.
 */
test.describe('customers list', () => {
  let customers: CustomersPage;

  test.beforeEach(async ({ page }) => {
    customers = new CustomersPage(page);
  });

  async function testCustomer(): Promise<ListedCustomer> {
    const found = await customers.findByMobile(testCustomerMobile);
    expect(found, `customers with mobile ${testCustomerMobile}`).toHaveLength(1);
    return found[0];
  }

  test('lists nothing until a search names a customer', async () => {
    const listed = await customers.open();

    expect(listed).toEqual([]);
    await expect(customers.noRecords).toBeVisible();
    await expect(customers.table).toHaveCount(0);
    expect(await customers.total()).toBe(0);
  });

  test('finds a customer by mobile and lists their row', async () => {
    await customers.open();
    const customer = await testCustomer();

    expect(customer.mobile).toBe(`966${testCustomerMobile}`);
    await expect(customers.rows).toHaveCount(1);
    expect(await customers.total()).toBe(1);
    const row = await customers.listedCustomer(customer.id);
    expect(Object.keys(row)).toEqual(COLUMNS);
    expect(row).toMatchObject({
      '#': '1',
      'Customer Name': customer.name,
      'Customer phone number': customer.mobile,
      'Customer email': customer.email,
      Bookings: 'Bookings',
      'Customer Status': customer.isActive ? 'Active' : 'Inactive',
    });
    expect(row['Created date']).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4} \d{2}:\d{2} [AP]M$/);
    for (const action of ['Edit', 'delete', 'Timeline'] as const) {
      await expect(customers.action(customer.id, action)).toBeVisible();
    }
  });

  test('opens a customer’s details', async ({ page }) => {
    await customers.open();
    const customer = await testCustomer();

    await customers.openCustomer(customer.id);
    const details = new CustomerDetailsPage(page);
    await details.expectLoaded();

    expect(await details.detail('Mobile Number')).toBe(customer.mobile);
    expect(await details.detail('Email address')).toBe(customer.email);
    expect(`${await details.detail('First name')} ${await details.detail('Last Name')}`).toBe(customer.name);
    expect(await details.detail('Status')).toBe(customer.isActive ? 'Active' : 'Inactive');
    if (customer.status) {
      expect(await details.detail('User Type')).toBe(USER_TYPES[customer.status]);
    }
    expect(await details.detail('National ID')).toMatch(/^\d{10}$/);
    expect(Number(await details.detail('Wallet balance'))).not.toBeNaN();
  });

  test('opens the edit form filled with the customer, and leaves without saving', async ({ page }) => {
    const mutations = recordMutations(page);
    await customers.open();
    const customer = await testCustomer();
    await customers.openCustomer(customer.id);
    const details = new CustomerDetailsPage(page);
    await details.expectLoaded();
    const expected = {
      firstName: await details.detail('First name'),
      lastName: await details.detail('Last Name'),
      nationalId: await details.detail('National ID'),
    };

    await details.edit();
    const form = new EditCustomerPage(page);
    await form.expectLoaded();

    await expect(form.field('First Name')).toHaveValue(expected.firstName);
    await expect(form.field('Last Name')).toHaveValue(expected.lastName);
    await expect(form.field('Email Address')).toHaveValue(customer.email);
    await expect(form.field('National ID')).toHaveValue(expected.nationalId);
    // The mobile is shown spaced out (`+966 591 593 593`) and cannot be changed.
    await expect(form.mobile).toBeDisabled();
    expect((await form.mobile.inputValue()).replace(/\D/g, '')).toBe(customer.mobile);
    await expect(form.saveButton).toBeEnabled();

    await form.cancel();
    expect(mutations).toEqual([]);
  });

  test('the Bookings link lists the customer’s bookings', async ({ page }) => {
    await customers.open();
    const customer = await testCustomer();

    const listed = page.waitForResponse((r) => isOperation(r, 'GetBookingsQuery'), { timeout: 30_000 });
    await customers.bookingsLink(customer.id).click();
    const response = await listed;

    await expect(page).toHaveURL((url) => decodeURIComponent(url.search) === `?{"userId":"${customer.id}"}`);
    expect(response.request().postDataJSON().variables).toMatchObject({ userId: customer.id });
    const bookings: { userId: string }[] = (await response.json()).data.dashboardRentals.collection;
    expect(bookings.length).toBeGreaterThan(0);
    expect(new Set(bookings.map((b) => b.userId))).toEqual(new Set([customer.id]));
    const table = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Booking ID' }) });
    await expect(table.locator('tbody tr').first()).toBeVisible();
  });

  test('Timeline opens the customer’s audit log', async () => {
    await customers.open();
    const customer = await testCustomer();

    const audits = await customers.openTimeline(customer.id);

    if (audits.length === 0) {
      await expect(customers.timelineDialog.getByText('No records found!')).toBeVisible();
    }
    await customers.timelineDialog.getByRole('button', { name: 'Close' }).first().click();
    await expect(customers.timelineDialog).toBeHidden();
  });

  test('pages through a search, keeping the filter', async () => {
    await customers.open();
    await customers.filters.open();
    await customers.filters.nationalId.fill(broadNationalId);
    const { customers: firstPage } = await customers.search();
    expect(await customers.total()).toBeGreaterThan(10);
    await expect(customers.rows).toHaveCount(10);

    const response = await customers.goToPage(2);

    expect(response.request().postDataJSON().variables).toMatchObject({ page: 2, nid: broadNationalId });
    const secondIds = await customers.column('Customer ID');
    expect(secondIds.length).toBeGreaterThan(0);
    for (const id of secondIds) {
      expect(firstPage.map((c) => c.id)).not.toContain(id);
    }
  });

  test('shows 25 customers a page', async () => {
    await customers.open();
    await customers.filters.open();
    await customers.filters.nationalId.fill(broadNationalId);
    await customers.search();
    expect(await customers.total()).toBeGreaterThan(25);

    const response = await customers.setPageSize(25);

    expect(response.request().postDataJSON().variables).toMatchObject({ limit: 25, nid: broadNationalId });
    await expect(customers.rows).toHaveCount(25);
  });
});
