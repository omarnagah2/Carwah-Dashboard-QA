import { expect, test } from '../../src/fixtures/test';
import { testData } from '../../src/config/test-data';
import { CompaniesPage, type ListedCompany } from '../../src/pages/companies.page';

const { knownAlly, rareClass } = testData.companies;

/**
 * Read-only. Each filter is checked two ways: the query carries it, and every
 * partner that comes back satisfies it. Values come from the list's first
 * page, except the ally and class.
 */
test.describe('partners filters', () => {
  let companies: CompaniesPage;
  let firstPage: ListedCompany[];
  let unfilteredTotal: number;

  test.beforeEach(async ({ page }) => {
    companies = new CompaniesPage(page);
    ({ companies: firstPage, total: unfilteredTotal } = await companies.open());
    await companies.filters.open();
  });

  test('by email', async () => {
    const { email, id } = firstPage[0];

    await companies.filters.email.fill(email);
    const { query, companies: found } = await companies.search();

    expect(query.email).toBe(email);
    expect(found.map((c) => c.id)).toContain(id);
    for (const company of found) {
      expect(company.email.toLowerCase()).toContain(email.toLowerCase());
    }
  });

  test('by manager name', async () => {
    const { managerName, id } = firstPage[0];

    await companies.filters.managerName.fill(managerName);
    const { query, companies: found } = await companies.search();

    expect(query.managerName).toBe(managerName);
    expect(found.map((c) => c.id)).toContain(id);
    // A partial match: "asmaa" also finds "asmaa test company 7".
    for (const name of await companies.column('Manager Name')) {
      expect(name.toLowerCase()).toContain(managerName.toLowerCase());
    }
  });

  test('by ally name', async () => {
    await companies.filters.choose('Ally Name', knownAlly.name);
    const { query, companies: found, total } = await companies.search();

    expect(query.allyCompanyIds).toEqual([knownAlly.id]);
    expect(total).toBe(1);
    expect(found.map((c) => c.id)).toEqual([knownAlly.id]);
    expect(await companies.column('Ally Name')).toEqual([knownAlly.name]);
  });

  test('by class', async () => {
    await companies.filters.choose('Class', rareClass);
    const { query, companies: found, total } = await companies.search();

    expect(query.allyClasses).toEqual([rareClass]);
    expect(found.length).toBeGreaterThan(0);
    expect(total).toBeLessThan(unfilteredTotal);
    expect(new Set(found.map((c) => c.allyClass))).toEqual(new Set([rareClass]));
    expect(new Set(await companies.column('Class'))).toEqual(new Set([rareClass]));
  });

  for (const [status, isActive] of [
    ['Active', true],
    ['Inactive', false],
  ] as const) {
    test(`by status: ${status}`, async () => {
      await companies.filters.choose('Status', status);
      const { query, companies: found, total } = await companies.search();

      expect(query.isActive).toBe(isActive);
      expect(found.length).toBeGreaterThan(0);
      expect(total).toBeLessThan(unfilteredTotal);
      for (const company of found) {
        expect(company.isActive, `partner ${company.id}`).toBe(isActive);
      }
      expect(new Set(await companies.column('Status'))).toEqual(new Set([CompaniesPage.statusLabel(isActive)]));
    });
  }

  test('by mobile', async () => {
    const company = firstPage.find((c) => c.phoneNumber.startsWith('9665'));
    test.skip(!company, 'No partner on the first page has a Saudi mobile');
    const local = company!.phoneNumber.slice(3);

    await companies.filters.mobile.fill(local);
    const { query, companies: found } = await companies.search();

    expect(query.phoneNumber).toBe(company!.phoneNumber);
    expect(found.map((c) => c.id)).toContain(company!.id);
    for (const phone of await companies.column('phone Number')) {
      expect(phone).toBe(company!.phoneNumber);
    }
  });

  test('clear brings back the unfiltered list', async () => {
    await companies.filters.choose('Class', rareClass);
    await companies.search();
    expect(await companies.total()).toBeLessThan(unfilteredTotal);

    await companies.clearFilters();

    await expect(companies.filters.placeholder('Class')).toBeVisible();
    await expect(companies.totalResults).toHaveText(`Total Results: ${unfilteredTotal}`);
    expect(await companies.column('ID')).toEqual(firstPage.map((c) => c.id));
  });
});
