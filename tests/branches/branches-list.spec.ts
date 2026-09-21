import { expect, test } from '../../src/fixtures/test';
import { testData } from '../../src/config/test-data';
import { BranchDetailsPage, WEEK_DAYS } from '../../src/pages/branch-details.page';
import { BranchesPage } from '../../src/pages/branches.page';
import { CompanyFormPage } from '../../src/pages/company-form.page';
import { recordMutations } from '../../src/utils/mutations';

const { knownBranch, ally } = testData.branches;

const COLUMNS = ['#', 'BranchID', 'Ally Name', 'Branch Name', 'Status', 'cars', 'City', 'Email', 'Actions'];

/**
 * Read-only. Branches belong to real partners and the lifecycle books at
 * Hegazy Riyadh, so nothing here saves a form, flips a row's active switch or
 * confirms a delete — the delete dialog warns it removes the branch's cars
 * with it.
 */
test.describe('branches list', () => {
  let branches: BranchesPage;

  test.beforeEach(async ({ page }) => {
    branches = new BranchesPage(page);
  });

  /** Narrows the list to the bookings' ally, whose branches are few. */
  async function allyBranches(): Promise<void> {
    await branches.open();
    await branches.filters.open();
    await branches.filters.choose('Ally Name', ally);
    await branches.search();
  }

  test('lists every branch, newest first, with its columns', async () => {
    const { branches: listed, total } = await branches.open();

    expect(total).toBeGreaterThan(10);
    expect(await branches.total()).toBe(total);
    await expect(branches.rows).toHaveCount(10);
    const ids = listed.map((b) => Number(b.id));
    expect(ids).toEqual([...ids].sort((a, b) => b - a));

    const [first] = listed;
    const row = await branches.listedBranch(first.id);
    expect(Object.keys(row)).toEqual(COLUMNS);
    expect(row).toMatchObject({
      '#': '1',
      'Ally Name': first.allyCompany.name,
      'Branch Name': first.name,
      Status: first.isActive ? 'Active' : 'Inactive',
      cars: 'Show Cars',
      City: first.area.enName,
      Email: first.allyCompany.email,
    });
    await expect(branches.activeSwitch(first.id)).toBeChecked({ checked: first.isActive });
    await expect(branches.action(first.id, 'Edit')).toHaveAttribute('href', `/cw/dashboard/branches/${first.id}/edit`);
    for (const action of ['delete', 'Timeline'] as const) {
      await expect(branches.action(first.id, action)).toBeVisible();
    }
    await expect(branches.createButton).toBeVisible();
  });

  test('opens a branch’s details, with its work shifts', async ({ page }) => {
    await allyBranches();

    await branches.openBranch(knownBranch.id);
    const details = new BranchDetailsPage(page);
    const profile = await details.open(knownBranch.id);

    expect(profile.name).toBe(knownBranch.name);
    expect(await details.detail('Branch Name')).toBe(profile.name);
    expect(await details.detail('Branch ID')).toBe(knownBranch.id);
    expect(await details.detail('Branch Address')).toBe(profile.address);
    expect(await details.detail('City')).toBe(profile.area.enName);
    expect(await details.detail('Status')).toBe(profile.isActive ? 'Active' : 'Inactive');
    // The Manager Number is the ally's own phone with a digit prepended.
    expect(await details.detail('Manager Number')).toContain(profile.officeNumber);

    await expect(details.shiftsHeading).toBeVisible();
    for (const day of WEEK_DAYS) {
      await expect(details.day(day)).toBeVisible();
    }
    expect(await details.openDay('Saturday')).toMatch(/^Saturday .*Start Time.*End Time/s);
    expect(profile.branchWorkingDays).toHaveLength(7);
  });

  test('Show Cars lists that branch’s cars', async () => {
    const { branches: listed } = await branches.open();
    const branch = listed.find((b) => b.id === knownBranch.id) ?? listed[0];

    const { cars, total } = await branches.showCars(branch.id);

    expect(await branches.carsDialog.locator('tbody tr').count()).toBe(cars.length);
    await expect(branches.carsDialog.getByText(`Total Results: ${total}`)).toBeVisible();
    for (const car of cars) {
      expect(car.branch.id, `car ${car.id}`).toBe(branch.id);
    }
    if (cars.length > 0) {
      expect(await branches.carsDialog.locator('thead th').allInnerTexts()).toEqual(
        expect.arrayContaining(['Car', 'Ally Name', 'Branch Name', 'Car Count']),
      );
    }
    await branches.closeCars();
  });

  test('Timeline opens the branch’s audit log', async () => {
    const { branches: listed } = await branches.open();

    const audits = await branches.openTimeline(listed[0].id);

    await expect(branches.timelineDialog).toContainText(`BranchID :${listed[0].id}`);
    if (audits.length > 0) {
      expect(audits[0].userName).toBeTruthy();
    }
    await branches.timelineDialog.getByRole('button', { name: 'Close' }).first().click();
    await expect(branches.timelineDialog).toBeHidden();
  });

  test('deleting asks first, warns it takes the cars too, and Cancel backs out', async ({ page }) => {
    const mutations = recordMutations(page);
    const { branches: listed } = await branches.open();

    await branches.action(listed[0].id, 'delete').click();

    await expect(branches.deleteDialog).toContainText('you want to delete this branch and the related cars?');
    await expect(branches.deleteDialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(branches.deleteDialog.getByRole('button', { name: 'delete', exact: true })).toBeVisible();
    await branches.cancelDelete();

    // Cancel closes the question and nothing is deleted.
    expect(mutations).toEqual([]);
    await expect(branches.rows.first()).toBeVisible();
    expect(await branches.column('BranchID')).toContain(listed[0].id);
  });

  test('Edit opens the branch’s form, and leaves without saving', async ({ page }) => {
    const mutations = recordMutations(page);
    await allyBranches();

    await branches.action(knownBranch.id, 'Edit').click();

    await expect(page).toHaveURL(new RegExp(`/cw/dashboard/branches/${knownBranch.id}/edit$`));
    const form = new CompanyFormPage(page);
    // The branch form shares the partner form's shape: tabs and a Save that
    // waits for a change.
    await expect(page.getByRole('heading', { level: 2 })).toContainText(/Branch/);
    await expect(form.saveButton).toBeDisabled();
    expect(mutations).toEqual([]);
  });

  test('the next page shows older branches', async () => {
    const { branches: firstPage } = await branches.open();

    const response = await branches.goToPage(2);

    expect(response.request().postDataJSON().variables).toMatchObject({ page: 2 });
    const secondIds = (await branches.column('BranchID')).map(Number);
    expect(secondIds.length).toBeGreaterThan(0);
    expect(Math.max(...secondIds)).toBeLessThan(Math.min(...firstPage.map((b) => Number(b.id))));
  });

  // This list's sizes are 10 / 20 / 40 / 80 / 100, not the bookings' 25s.
  test('shows 20 branches a page', async () => {
    await branches.open();

    const response = await branches.setPageSize(20);

    expect(response.request().postDataJSON().variables).toMatchObject({ limit: 20 });
    await expect(branches.rows).toHaveCount(20);
  });
});
