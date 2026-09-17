import { expect, test } from '../../src/fixtures/test';
import { testData } from '../../src/config/test-data';
import { CustomerDetailsPage } from '../../src/pages/customer-details.page';
import { CustomersPage, type ListedCustomer } from '../../src/pages/customers.page';

const { testCustomerMobile, broadNationalId, agency } = testData.customers;

/**
 * Read-only. Each filter is checked two ways: the query carries it, and every
 * customer that comes back satisfies it. The list only answers searches that
 * name a customer, so the dropdowns are combined with a national ID fragment.
 */
test.describe('customers filters', () => {
  let customers: CustomersPage;

  test.beforeEach(async ({ page }) => {
    customers = new CustomersPage(page);
    await customers.open();
    await customers.filters.open();
  });

  /** Looks the test customer up by mobile, then clears the panel again. */
  async function testCustomer(): Promise<ListedCustomer> {
    const [customer] = await customers.findByMobile(testCustomerMobile);
    expect(customer, `the customer with mobile ${testCustomerMobile}`).toBeDefined();
    await customers.clearFilters();
    return customer;
  }

  async function searchBroadly(): Promise<{ query: Record<string, unknown>; customers: ListedCustomer[] }> {
    await customers.filters.nationalId.fill(broadNationalId);
    const result = await customers.search();
    expect(result.query.nid).toBe(broadNationalId);
    expect(result.customers.length, 'customers found').toBeGreaterThan(0);
    return result;
  }

  test('by customer name', async () => {
    const customer = await testCustomer();

    await customers.filters.customerName.fill(customer.name);
    const { query, customers: found } = await customers.search();

    // The name goes out twice.
    expect(query).toMatchObject({ customerName: customer.name, name: customer.name });
    expect(found.map((c) => c.id)).toContain(customer.id);
    for (const name of await customers.column('Customer Name')) {
      expect(name.toLowerCase()).toContain(customer.name.toLowerCase());
    }
  });

  test('by email', async () => {
    const customer = await testCustomer();

    await customers.filters.email.fill(customer.email);
    const { query, customers: found } = await customers.search();

    expect(query.email).toBe(customer.email);
    expect(found.map((c) => c.id)).toContain(customer.id);
    for (const email of await customers.column('Customer email')) {
      expect(email.toLowerCase()).toContain(customer.email.toLowerCase());
    }
  });

  test('by national ID', async ({ page }) => {
    const customer = await testCustomer();
    const details = new CustomerDetailsPage(page);
    await details.open(customer.id);
    const nationalId = await details.detail('National ID');
    await customers.open();
    await customers.filters.open();

    await customers.filters.nationalId.fill(nationalId);
    const { query, customers: found } = await customers.search();

    expect(query.nid).toBe(nationalId);
    expect(found.map((c) => c.id)).toEqual([customer.id]);
  });

  test('by mobile', async () => {
    await customers.filters.mobile.fill(testCustomerMobile);
    const { query, customers: found } = await customers.search();

    expect(query.mobile).toBe(`966${testCustomerMobile}`);
    expect(found).toHaveLength(1);
    expect(await customers.column('Customer phone number')).toEqual([`966${testCustomerMobile}`]);
  });

  test('by type', async () => {
    await customers.filters.choose('Type', 'Resident');
    const { query, customers: found } = await searchBroadly();

    expect(query.customerStatuses).toEqual(['resident']);
    for (const customer of found) {
      expect(customer.status, `customer ${customer.id}`).toBe('resident');
    }
  });

  for (const [option, sent] of [
    ['Blocked', 'blocked'],
    ['Partially blocked', 'partially_blocked'],
  ] as const) {
    test(`by customer status: ${option}`, async () => {
      await customers.filters.choose('Customer Status', option);
      const { query, customers: found } = await searchBroadly();

      expect(query.blockingStatus).toBe(sent);
      for (const customer of found) {
        expect(customer.customerProfile.blockingStatus, `customer ${customer.id}`).toBe(sent);
      }
    });
  }

  test('by status', async () => {
    await customers.filters.choose('Status', 'Inactive');
    const { query, customers: found } = await searchBroadly();

    expect(query.isActive).toBe(false);
    for (const customer of found) {
      expect(customer.isActive, `customer ${customer.id}`).toBe(false);
    }
    expect(new Set(await customers.column('Customer Status'))).toEqual(new Set(['Inactive']));
  });

  test('by agency', async () => {
    await customers.filters.choose('Agency Name', agency.name);
    const { query, customers: found } = await searchBroadly();

    expect(query.agencyIds).toEqual([agency.id]);
    for (const customer of found) {
      expect(customer.agencyCustomerProfiles.map((p) => p.agencyId), `customer ${customer.id}`).toContain(agency.id);
    }
  });

  test('a dropdown alone finds nobody', async () => {
    await customers.filters.choose('Status', 'Active');
    const { query, customers: found } = await customers.search();

    expect(query.isActive).toBe(true);
    expect(found).toEqual([]);
    await expect(customers.noRecords).toBeVisible();
  });

  test('clear empties the panel and the list', async ({ page }) => {
    const customer = await testCustomer();
    await customers.filters.customerName.fill(customer.name);
    await customers.filters.choose('Status', 'Active');
    await customers.search();
    await expect(customers.rows.first()).toBeVisible();

    await customers.clearFilters();

    await expect(customers.filters.placeholder('Status')).toBeVisible();
    await expect(customers.table).toHaveCount(0);
    expect(await customers.total()).toBe(0);
    // The filter is dropped from the page URL too.
    await expect(page).toHaveURL(/\/cw\/dashboard\/customers$/);
  });
});
