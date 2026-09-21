import { expect, test } from '../../src/fixtures/test';
import { testData } from '../../src/config/test-data';
import { CarDetailsPage } from '../../src/pages/car-details.page';
import { CarsPage } from '../../src/pages/cars.page';
import { recordMutations } from '../../src/utils/mutations';

const { knownCar } = testData.cars;

const COLUMNS = ['', '#', 'Car', 'Ally Name', 'Branch Name', 'Transmission', 'Acriss Code', 'City Name', 'Car Count', 'Car Availability Status', 'Rent(Day,Week,Month)', 'Created At', 'Actions'];

/**
 * Read-only. Cars belong to real partners and the lifecycle rents one, so no
 * spec saves a form, flips a row's switch, or runs a bulk action (delete /
 * Update Cars).
 */
test.describe('cars list', () => {
  let cars: CarsPage;

  test.beforeEach(async ({ page }) => {
    cars = new CarsPage(page);
  });

  test('lists every car, newest first, with its columns', async () => {
    const { cars: listed, total } = await cars.open();

    expect(total).toBeGreaterThan(10);
    expect(await cars.total()).toBe(total);
    await expect(cars.rows).toHaveCount(10);
    const ids = listed.map((c) => Number(c.id));
    expect(ids).toEqual([...ids].sort((a, b) => b - a));

    const [first] = listed;
    const row = await cars.listedCar(first.id);
    expect(Object.keys(row)).toEqual(COLUMNS);
    expect(row).toMatchObject({
      '#': '1',
      Car: `${first.make.enName} ${first.carModel.enName} ${first.year}`,
      'Ally Name': first.allyName,
      'Branch Name': first.branch.enName,
      'Acriss Code': first.carModel.acrissCode,
      'City Name': first.branch.area.name,
      'Car Count': String(first.carsCount),
      'Car Availability Status': first.availabilityStatus ? 'Active' : 'Inactive',
      'Rent(Day,Week,Month)': `${first.dailyPrice}, ${first.weeklyPrice} ,${first.monthlyPrice}`,
    });
    await expect(cars.activeSwitch(first.id)).toBeChecked({ checked: first.availabilityStatus });
    await expect(cars.action(first.id, 'Timeline')).toBeVisible();
    for (const button of [cars.createButton, cars.fleetManagementButton, cars.bulkActionsButton]) {
      await expect(button).toBeVisible();
    }
  });

  test('the Transmission column shows each car’s transmission', async () => {
    test.fail(true, 'The list leaves Transmission empty although every car has one (Automatic/Manual)');
    const { cars: listed } = await cars.open();

    const shown = await cars.column('Transmission');

    expect(shown).toEqual(listed.map((c) => c.transmissionName));
  });

  test('opens a car’s details', async ({ page }) => {
    await cars.open();
    await cars.filters.open();
    await cars.filters.choose('branches', knownCar.branch);
    await cars.search();

    await cars.openCar(knownCar.id);
    const details = new CarDetailsPage(page);
    await details.open(knownCar.id);

    expect({
      make: await details.detail('Make'),
      model: await details.detail('Model'),
      year: await details.detail('Year'),
      ally: await details.detail('Ally Name'),
      branch: await details.detail('Branch Name'),
      daily: await details.detail('Rent/Day'),
    }).toEqual({
      make: knownCar.make,
      model: knownCar.model,
      year: String(knownCar.year),
      ally: knownCar.ally,
      branch: knownCar.branch,
      daily: String(knownCar.dailyPrice),
    });
    // The lifecycle's extension pricing leans on these (see CLAUDE.md).
    expect(await details.detail('Rent/Week')).toBe('88');
    for (const label of ['Car Availability Status', 'Transmission', 'Insurance Type', 'Acriss Code']) {
      expect(await details.detail(label), label).not.toBe('');
    }
    await expect(details.backButton).toBeVisible();
  });

  test('opens the edit form filled with the car, and leaves without saving', async ({ page }) => {
    const mutations = recordMutations(page);
    await cars.open();
    await cars.filters.open();
    await cars.filters.choose('branches', knownCar.branch);
    await cars.search();

    // Reached from the list, as a user would: Cancel goes back to it.
    await cars.action(knownCar.id, 'Edit').click();

    await expect(page).toHaveURL(new RegExp(`/cw/dashboard/cars/${knownCar.id}/edit$`));
    await expect(page.getByRole('heading', { name: 'Edit Car', level: 2 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('textbox', { name: 'Make' })).toHaveValue(knownCar.make, { timeout: 30_000 });
    await expect(page.getByRole('group', { name: 'Rental PriceWithout Tax' }).getByRole('spinbutton').first()).toHaveValue(
      String(knownCar.dailyPrice),
    );
    await expect(page.getByRole('group', { name: 'branch' })).toContainText(knownCar.branch);
    // Nothing has changed yet.
    await expect(page.getByRole('button', { name: 'save' })).toBeDisabled();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(/\/cw\/dashboard\/cars(\?.*)?$/);
    expect(mutations).toEqual([]);
  });

  test('Create New Car opens an empty form that cannot be saved yet', async ({ page }) => {
    await cars.open();

    await cars.createButton.click();

    await expect(page).toHaveURL(/\/cw\/dashboard\/cars\/add$/);
    await expect(page.getByRole('heading', { name: 'Add New Car', level: 2 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'save' })).toBeDisabled();
  });

  test('the bulk Actions menu offers delete and Update Cars', async ({ page }) => {
    const mutations = recordMutations(page);
    await cars.open();

    // Opened and closed without picking anything.
    expect(await cars.bulkActions()).toEqual(['delete', 'Update Cars']);
    expect(mutations).toEqual([]);
  });

  test('Timeline opens the car’s audit log', async () => {
    const { cars: listed } = await cars.open();

    const audits = await cars.openTimeline(listed[0].id);

    await expect(cars.timelineDialog).toContainText(`Car ID :${listed[0].id}`);
    if (audits.length > 0) {
      expect(audits[0].userName).toBeTruthy();
    }
    await cars.timelineDialog.getByRole('button', { name: 'Close' }).first().click();
    await expect(cars.timelineDialog).toBeHidden();
  });

  test('Fleet Management opens its own page', async ({ page }) => {
    await cars.open();

    await cars.fleetManagementButton.click();

    await expect(page).toHaveURL(/\/cw\/dashboard\/cars\/fleet-management$/);
    await expect(page.getByRole('heading', { name: 'Fleet Management', level: 2 })).toBeVisible();
    await expect(page.getByRole('combobox').filter({ hasText: 'Ally' })).toBeVisible();
    await expect(page.getByRole('combobox').filter({ hasText: 'Branches' })).toBeVisible();
  });

  test('the next page shows older cars', async () => {
    const { cars: firstPage } = await cars.open();

    const response = await cars.goToPage(2);

    expect(response.request().postDataJSON().variables).toMatchObject({ page: 2 });
    const oldestOnFirst = Math.min(...firstPage.map((c) => Number(c.id)));
    const second: { id: string }[] = (await response.json()).data.allyCars.collection;
    expect(second.length).toBeGreaterThan(0);
    expect(Math.max(...second.map((c) => Number(c.id)))).toBeLessThan(oldestOnFirst);
  });

  // Like branches: 10 / 20 / 40 / 80 / 100.
  test('shows 20 cars a page', async () => {
    await cars.open();

    const response = await cars.setPageSize(20);

    expect(response.request().postDataJSON().variables).toMatchObject({ limit: 20 });
    await expect(cars.rows).toHaveCount(20);
  });
});
