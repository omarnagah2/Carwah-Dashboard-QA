import { expect, test, type Page } from '@playwright/test';
import { testData } from '../../src/config/test-data';
import { BookingDetailsPage } from '../../src/pages/booking-details.page';
import { formatDate } from '../../src/pages/booking-filters.component';
import { BookingsPage } from '../../src/pages/bookings.page';

/**
 * Reads the customer of the list's first booking from its details page, the
 * only place their national ID and mobile are shown, and returns to the list.
 */
async function customerOfFirstBooking(page: Page): Promise<{ nationalId: string; mobile: string }> {
  const list = new BookingsPage(page);
  const [bookingId] = await list.column('Booking ID');
  await list.openBooking(bookingId);
  const details = new BookingDetailsPage(page);
  await details.expectLoaded();
  const customer = { nationalId: await details.detail('National ID'), mobile: await details.detail('Mobile Number') };
  await list.open();
  return customer;
}

/**
 * Read-only, like the list specs. Each filter is checked two ways: the query
 * carries it, and every row that comes back satisfies it.
 */
test.describe('bookings filters', () => {
  let bookings: BookingsPage;

  test.beforeEach(async ({ page }) => {
    bookings = new BookingsPage(page);
    await bookings.open();
    await bookings.filters.open();
  });

  test('by customer name', async () => {
    const [customer] = await bookings.column('Customer');

    await bookings.filters.customerName.fill(customer);
    const { query } = await bookings.applyFilters();

    expect(query.customerName).toBe(customer);
    const names = await bookings.column('Customer');
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name.toLowerCase()).toContain(customer.toLowerCase());
    }
  });

  test('by ally', async () => {
    const [ally] = await bookings.column('Ally');

    await bookings.filters.choose('Ally Name', ally);
    const { query } = await bookings.applyFilters();

    expect(query.allyCompanyId).toHaveLength(1);
    const allies = await bookings.column('Ally');
    expect(allies.length).toBeGreaterThan(0);
    expect(new Set(allies)).toEqual(new Set([ally]));
  });

  test('by status', async () => {
    const cancelledCount = await bookings.statusCount('Cancelled');

    await bookings.filters.choose('Status', 'Cancelled');
    const { query } = await bookings.applyFilters();

    expect(query.status).toEqual(['cancelled']);
    for (const status of await bookings.column('Booking Status')) {
      expect(status).toMatch(/^Cancelled\b/);
    }
    // Both counts are read within seconds, and bookings are rarely cancelled
    // in that window.
    expect(await bookings.total()).toBe(cancelledCount);
  });

  test('by payment method', async () => {
    await bookings.filters.choose('Payment Method', 'Cash');
    const { query } = await bookings.applyFilters();

    expect(query.paymentMethod).toEqual(['CASH']);
    const methods = await bookings.column('Payment Method');
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) {
      expect(method).toMatch(/^Cash\b/);
    }
  });

  test('by make', async () => {
    const { make } = testData.bookingFilters;

    await bookings.filters.choose('Make', make);
    const { query } = await bookings.applyFilters();

    expect(query.makeName).toEqual([make]);
    const cars = await bookings.column('Car');
    expect(cars.length).toBeGreaterThan(0);
    for (const car of cars) {
      expect(car).toMatch(new RegExp(`^${make} - `));
    }
  });

  test('by city', async () => {
    const { city } = testData.bookingFilters;

    await bookings.filters.choose('City', city);
    const { query } = await bookings.applyFilters();

    expect(query.cityName).toEqual([city]);
    const pickups = await bookings.column('Pickup date time');
    expect(pickups.length).toBeGreaterThan(0);
    for (const pickup of pickups) {
      expect(pickup).toContain(city);
    }
  });

  for (const { field, column, sent } of [
    { field: 'Pick Up Date', column: 'Pickup date time', sent: 'pickUpDate' },
    { field: 'Dropoff Date', column: 'Dropoff date time', sent: 'dropOffDate' },
  ] as const) {
    test(`by ${field.toLowerCase()}`, async () => {
      // The calendar opens on the current month, so take a date from the list
      // that falls in it.
      const now = new Date();
      const date = (await bookings.column(column))
        .map((text) => new Date(text.match(/^[A-Z][a-z]+ \d{1,2}, \d{4}/)?.[0] ?? ''))
        .find((d) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth());
      test.skip(!date, `No booking on the first page has a ${field.toLowerCase()} this month`);

      await bookings.filters.pickDate(field, date!);
      const { query } = await bookings.applyFilters();

      expect(query[sent]).toBe(formatDate(date!));
      const listed = date!.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const dates = await bookings.column(column);
      expect(dates.length).toBeGreaterThan(0);
      for (const shown of dates) {
        expect(shown.startsWith(listed)).toBeTruthy();
      }
    });
  }

  test('by branch', async () => {
    const [branch] = await bookings.column('branch');

    await bookings.filters.choose('branches', branch);
    const { query } = await bookings.applyFilters();

    expect(query.branchIds).toHaveLength(1);
    const branches = await bookings.column('branch');
    expect(branches.length).toBeGreaterThan(0);
    expect(new Set(branches)).toEqual(new Set([branch]));
  });

  test('by rent type', async () => {
    await bookings.filters.choose('Rent Type', 'Rent-to-Own');
    const { query, bookings: found } = await bookings.applyFilters();

    expect(query.rentType).toEqual(['RENT_TO_OWN']);
    expect(found.length).toBeGreaterThan(0);
    for (const booking of found) {
      expect(booking.isRentToOwn, `booking ${booking.id}`).toBe(true);
    }
  });

  test('by sub-status', async () => {
    const lateCount = await bookings.statusCount('Late Confirmation');

    await bookings.filters.choose('substatus', 'Late Confirmation');
    const { query, bookings: found } = await bookings.applyFilters();

    expect(query.subStatus).toEqual(['late_confirmation']);
    expect(found.length).toBeGreaterThan(0);
    for (const booking of found) {
      expect(booking.subStatus, `booking ${booking.id}`).toBe('late_confirmation');
    }
    for (const status of await bookings.column('Booking Status')) {
      expect(status).toContain('Late Confirmation');
    }
    expect(await bookings.total()).toBe(lateCount);
  });

  test('by national ID', async ({ page }) => {
    const { nationalId } = await customerOfFirstBooking(page);
    test.skip(!nationalId, 'The first booking’s customer has no national ID');

    await bookings.filters.open();
    await bookings.filters.nationalId.fill(nationalId);
    const { query, bookings: found } = await bookings.applyFilters();

    expect(query.userNid).toBe(nationalId);
    expect(found.length).toBeGreaterThan(0);
    await bookings.openBooking(found[0].id);
    expect(await new BookingDetailsPage(page).detail('National ID')).toBe(nationalId);
  });

  test('by customer mobile', async ({ page }) => {
    const { mobile } = await customerOfFirstBooking(page);
    test.skip(!mobile.startsWith('966'), `The first booking’s customer has no Saudi mobile (${mobile})`);
    const local = mobile.slice(3);

    await bookings.filters.open();
    await bookings.filters.mobile.fill(local);
    const { query, bookings: found } = await bookings.applyFilters();

    expect(query.customerMobile).toBe(mobile);
    expect(found.length).toBeGreaterThan(0);
    await bookings.openBooking(found[0].id);
    expect(await new BookingDetailsPage(page).detail('Mobile Number')).toBe(mobile);
  });

  // Nothing on the list or in the API's row shows these, so they are checked
  // by what is sent and by the list narrowing without emptying.
  for (const { name, apply, sent, expected } of [
    {
      name: 'source',
      apply: (b: BookingsPage) => b.filters.choose('Source', testData.bookingFilters.source),
      sent: 'source',
      expected: [testData.bookingFilters.source],
    },
    {
      name: 'payment brand',
      apply: (b: BookingsPage) => b.filters.choose('paymentbrand', testData.bookingFilters.paymentBrand.label),
      sent: 'paymentBrand',
      expected: [testData.bookingFilters.paymentBrand.sent],
    },
    {
      name: 'train station',
      apply: (b: BookingsPage) => b.filters.choose('Train Stations', testData.bookingFilters.trainStation),
      sent: 'trainStationIds',
      expected: [expect.any(Number)],
    },
    {
      name: 'plate number',
      apply: (b: BookingsPage) => b.filters.plateNo.fill(testData.bookingFilters.plateNo),
      sent: 'plateNo',
      expected: testData.bookingFilters.plateNo,
    },
  ]) {
    test(`by ${name}`, async () => {
      const everything = await bookings.statusCount('All');

      await apply(bookings);
      const { query } = await bookings.applyFilters();

      expect(query[sent]).toEqual(expected);
      const narrowed = await bookings.total();
      expect(narrowed).toBeGreaterThan(0);
      expect(narrowed).toBeLessThan(everything);
    });
  }

  test('by airport', async () => {
    test.fail(true, 'Product bug: choosing an airport and searching sends no GetBookingsQuery, so the list never changes');
    const everything = await bookings.statusCount('All');

    await bookings.filters.choose('Airports', testData.bookingFilters.airport);
    await bookings.applyFilters();

    expect(await bookings.total()).toBeLessThan(everything);
  });

  for (const occurrence of [0, 1]) {
    test(`by agency (Agency Name field ${occurrence + 1} of 2)`, async () => {
      test.fail(
        true,
        'Product bug: the chosen agency is kept in the page URL but not sent in GetBookingsQuery, so the list is not filtered',
      );
      const { agency } = testData.bookingFilters;
      const everything = await bookings.statusCount('All');

      await bookings.filters.choose('Agency Name', agency, { occurrence });
      const { bookings: found } = await bookings.applyFilters();

      expect(await bookings.total()).toBeLessThan(everything);
      for (const booking of found) {
        expect(booking.agencyName, `booking ${booking.id}`).toBe(agency);
      }
    });
  }

  test('a search that matches nothing says so', async () => {
    await bookings.filters.customerName.fill(`no-such-customer-${Date.now()}`);
    await bookings.applyFilters();

    await expect(bookings.noRecords).toBeVisible();
    await expect(bookings.table).toHaveCount(0);
    expect(await bookings.total()).toBe(0);
  });

  test('clear brings back the unfiltered list', async () => {
    const [customer] = await bookings.column('Customer');
    await bookings.filters.customerName.fill(customer);
    await bookings.filters.choose('Status', 'Cancelled');
    await bookings.applyFilters();

    await bookings.clearFilters();

    await expect(bookings.filters.customerName).toHaveValue('');
    await expect(bookings.filters.placeholder('Status')).toBeVisible();
    expect(await bookings.total()).toBe(await bookings.statusCount('All'));
  });
});
