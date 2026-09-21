import { expect, test } from '../../src/fixtures/test';
import { testData } from '../../src/config/test-data';
import { CarsPage } from '../../src/pages/cars.page';

const { knownCar } = testData.cars;

/**
 * Read-only. Each working filter is checked two ways: the query carries it,
 * and every car that comes back satisfies it. Five filters do nothing today;
 * their specs are written as they should behave and marked `test.fail`.
 */
test.describe('cars filters', () => {
  let cars: CarsPage;
  let unfilteredTotal: number;

  test.beforeEach(async ({ page }) => {
    cars = new CarsPage(page);
    ({ total: unfilteredTotal } = await cars.open());
    await cars.filters.open();
  });

  test('by ally name', async () => {
    await cars.filters.choose('Ally Name', knownCar.ally);
    const { query, cars: found, total } = await cars.search();

    expect(query.allyIds).toEqual([testData.companies.knownAlly.id]);
    expect(total).toBeLessThan(unfilteredTotal);
    expect(found.length).toBeGreaterThan(0);
    for (const car of found) {
      expect(car.allyName, `car ${car.id}`).toBe(knownCar.ally);
    }
  });

  test('by branch', async () => {
    await cars.filters.choose('branches', knownCar.branch);
    const { query, cars: found } = await cars.search();

    expect(query.branchIds).toEqual([Number(testData.branches.knownBranch.id)]);
    expect(found.map((c) => c.id)).toContain(knownCar.id);
    for (const car of found) {
      expect(car.branch.enName, `car ${car.id}`).toBe(knownCar.branch);
    }
  });

  test('by make', async () => {
    await cars.filters.choose('Make', knownCar.make);
    const { query, cars: found } = await cars.search();

    expect(query.makes).toHaveLength(1);
    expect(found.map((c) => c.id)).toContain(knownCar.id);
    for (const car of found) {
      expect(car.make.enName, `car ${car.id}`).toBe(knownCar.make);
    }
  });

  test('by make and model', async () => {
    await cars.filters.choose('Make', knownCar.make);
    await cars.filters.choose('Models', knownCar.model);
    const { query, cars: found } = await cars.search();

    expect(query.models).toHaveLength(1);
    expect(found.map((c) => c.id)).toContain(knownCar.id);
    for (const car of found) {
      expect(`${car.make.enName} ${car.carModel.enName}`, `car ${car.id}`).toBe(`${knownCar.make} ${knownCar.model}`);
    }
  });

  test('by year', async () => {
    await cars.filters.choose('Year', String(knownCar.year));
    const { query, cars: found, total } = await cars.search();

    expect(query.years).toEqual([knownCar.year]);
    expect(total).toBeLessThan(unfilteredTotal);
    for (const car of found) {
      expect(car.year, `car ${car.id}`).toBe(knownCar.year);
    }
  });

  test('by transmission', async () => {
    await cars.filters.choose('Transmission', 'Manual');
    const { query, cars: found, total } = await cars.search();

    expect(query.transmission).toBe('manual');
    expect(total).toBeLessThan(unfilteredTotal);
    for (const car of found) {
      expect(car.transmissionName, `car ${car.id}`).toBe('Manual');
    }
  });

  test('by availability', async () => {
    await cars.filters.choose('Car Availability Status', 'Inactive');
    const { query, cars: found, total } = await cars.search();

    expect(query.availabilityStatus).toBe(false);
    expect(total).toBeLessThan(unfilteredTotal);
    for (const car of found) {
      expect(car.availabilityStatus, `car ${car.id}`).toBe(false);
    }
    expect(new Set(await cars.column('Car Availability Status'))).toEqual(new Set(['Inactive']));
  });

  test('by rent type', async () => {
    await cars.filters.choose('Rent Type', 'Rent-to-Own');
    const { query, total } = await cars.search();

    expect(query.rentType).toBe('RENT_TO_OWN');
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(unfilteredTotal);
  });

  test('by insurance type', async () => {
    await cars.filters.choose('Insurance Type', 'Full');
    const { query, total } = await cars.search();

    expect(query.insuranceId).toEqual([2]);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(unfilteredTotal);
  });

  test('by acriss code', async () => {
    await cars.filters.acrissCode.fill('DDBV');
    const { query, cars: found } = await cars.search();

    expect(query.acrissCode).toBe('DDBV');
    expect(found.length).toBeGreaterThan(0);
    for (const car of found) {
      expect(car.carModel.acrissCode, `car ${car.id}`).toBe('DDBV');
    }
  });

  test('by plate number', async () => {
    await cars.filters.plateNo.fill('1234');
    const { query, total } = await cars.search();

    // Nothing on the list or in the API's row shows the plate.
    expect(query.plateNo).toBe('1234');
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(unfilteredTotal);
  });

  test('a model alone narrows the list', async () => {
    test.fail(true, 'Models on its own is sent (models: [id]) but ignored — the total stays unfiltered; it only works with a Make');
    await cars.filters.choose('Models', knownCar.model);
    const { query, total } = await cars.search();

    expect(query.models).toHaveLength(1);
    expect(total).toBeLessThan(unfilteredTotal);
  });

  for (const [placeholder, option] of [
    ['Vehicle Type', 'Sedan'],
    ['City', 'Riyadh'],
    ['KM Type', 'Unlimited KM'],
  ] as const) {
    test(`by ${placeholder.toLowerCase()}`, async () => {
      test.fail(true, `Choosing a ${placeholder} and pressing Search sends no query at all — the choice never reaches the list`);
      await cars.filters.choose(placeholder, option);

      const sent = await cars.searchSends();

      expect(sent, 'queries sent').not.toEqual([]);
    });
  }

  test('by rent per day', async () => {
    test.fail(true, 'Rent/Day is left out of the query: Search sends AllyCars without it, even after Enter');
    await cars.filters.rentPerDay.fill(String(knownCar.dailyPrice));

    const sent = await cars.searchSends();

    expect(sent.length).toBeGreaterThan(0);
    expect(JSON.stringify(sent.at(-1))).toContain(String(knownCar.dailyPrice));
  });

  test('clear brings back the unfiltered list', async ({ page }) => {
    await cars.filters.choose('Ally Name', knownCar.ally);
    await cars.search();
    expect(await cars.total()).toBeLessThan(unfilteredTotal);

    await cars.filters.clearButton.click();

    await expect(cars.filters.placeholder('Ally Name')).toBeVisible();
    await expect(cars.totalResults).toHaveText(`Total Results: ${unfilteredTotal}`);
    await expect(page).toHaveURL(/\/cw\/dashboard\/cars(\?\{\})?$/);
  });
});
