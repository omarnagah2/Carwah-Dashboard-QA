import { expect, test } from '../../src/fixtures/test';
import { testData } from '../../src/config/test-data';
import { BranchesPage, type ListedBranch } from '../../src/pages/branches.page';

const { knownBranch, ally, city } = testData.branches;

/**
 * Read-only. Each filter is checked two ways: the query carries it, and every
 * branch that comes back satisfies it.
 */
test.describe('branches filters', () => {
  let branches: BranchesPage;
  let unfilteredTotal: number;

  test.beforeEach(async ({ page }) => {
    branches = new BranchesPage(page);
    ({ total: unfilteredTotal } = await branches.open());
    await branches.filters.open();
  });

  test('by ally name', async () => {
    await branches.filters.choose('Ally Name', ally);
    const { query, branches: found, total } = await branches.search();

    expect(query.allyCompanyIds).toEqual([testData.companies.knownAlly.id]);
    expect(found.length).toBeGreaterThan(0);
    expect(total).toBeLessThan(unfilteredTotal);
    for (const branch of found) {
      expect(branch.allyCompany.name, `branch ${branch.id}`).toBe(ally);
    }
    expect(new Set(await branches.column('Ally Name'))).toEqual(new Set([ally]));
  });

  test('by branch name', async () => {
    // Its list only loads once 4 characters are typed, so the name is typed.
    await branches.filters.choose('branches', knownBranch.name);
    const { query, branches: found } = await branches.search();

    expect(query.branchIds).toEqual([Number(knownBranch.id)]);
    expect(found.map((b) => b.id)).toEqual([knownBranch.id]);
    expect(await branches.column('Branch Name')).toEqual([knownBranch.name]);
  });

  test('by city', async () => {
    await branches.filters.choose('City', city);
    const { query, branches: found, total } = await branches.search();

    expect(query.areaIds).toEqual([1]);
    expect(found.length).toBeGreaterThan(0);
    expect(total).toBeLessThan(unfilteredTotal);
    for (const branch of found) {
      expect(branch.area.enName, `branch ${branch.id}`).toBe(city);
    }
    expect(new Set(await branches.column('City'))).toEqual(new Set([city]));
  });

  for (const [status, isActive] of [
    ['Active', true],
    ['Inactive', false],
  ] as const) {
    test(`by status: ${status}`, async () => {
      await branches.filters.choose('Status', status);
      const { query, branches: found, total } = await branches.search();

      expect(query.isActive).toBe(isActive);
      expect(found.length).toBeGreaterThan(0);
      expect(total).toBeLessThan(unfilteredTotal);
      for (const branch of found) {
        expect(branch.isActive, `branch ${branch.id}`).toBe(isActive);
      }
      expect(new Set(await branches.column('Status'))).toEqual(new Set([status]));
    });
  }

  test('by status: deleted', async () => {
    await branches.filters.choose('Status', 'deleted');
    const { query, branches: found } = await branches.search();

    // Deleting a branch is a soft delete: these still list, with a date.
    expect(query).toMatchObject({ isDeleted: true });
    expect(found.length).toBeGreaterThan(0);
    for (const branch of found) {
      expect(branch.deletedAt, `branch ${branch.id}`).not.toBeNull();
    }
  });

  test('the deleted status asks the API only once, correctly', async ({ page }) => {
    test.fail(true, 'It first sends isDeleted: "isDeleted" — a 400 — before the right query');
    const refused: string[] = [];
    page.on('response', (response) => {
      if (!response.ok() && response.url().includes('/graphql')) {
        refused.push(`${response.status()} ${JSON.stringify(response.request().postDataJSON()?.variables)}`);
      }
    });

    await branches.filters.choose('Status', 'deleted');
    await branches.search();

    expect(refused, 'refused queries').toEqual([]);
  });

  test('two filters narrow together', async () => {
    await branches.filters.choose('Ally Name', ally);
    await branches.filters.choose('City', city);
    const { query, branches: found } = await branches.search();

    expect(query).toMatchObject({ allyCompanyIds: [testData.companies.knownAlly.id], areaIds: [1] });
    expect(found.length).toBeGreaterThan(0);
    for (const branch of found) {
      expect({ ally: branch.allyCompany.name, city: branch.area.enName }).toEqual({ ally, city });
    }
  });

  test('clear brings back the unfiltered list', async () => {
    await branches.filters.choose('Ally Name', ally);
    await branches.search();
    expect(await branches.total()).toBeLessThan(unfilteredTotal);

    await branches.clearFilters();

    await expect(branches.filters.placeholder('Ally Name')).toBeVisible();
    await expect(branches.totalResults).toHaveText(`Total Results: ${unfilteredTotal}`);
  });
});

/** Keeps TypeScript honest about the row type the specs rely on. */
export type { ListedBranch };
