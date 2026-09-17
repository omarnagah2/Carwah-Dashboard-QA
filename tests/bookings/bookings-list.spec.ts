import { expect, test } from '../../src/fixtures/test';
import { BookingDetailsPage } from '../../src/pages/booking-details.page';
import { BookingsPage } from '../../src/pages/bookings.page';

/**
 * Read-only: these specs browse the shared pre-prod bookings and never change
 * one. New bookings arrive while a run is going, so nothing here pins a
 * particular booking or an exact count across two reads.
 */
test.describe('bookings list', () => {
  let bookings: BookingsPage;

  test.beforeEach(async ({ page }) => {
    bookings = new BookingsPage(page);
    await bookings.open();
  });

  test('shows a page of bookings with its columns', async () => {
    for (const header of ['Booking ID', 'Booking No.', 'Customer', 'Ally', 'Car', 'Booking Status']) {
      await expect(bookings.table.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
    }
    await expect(bookings.rows).toHaveCount(10);
    await expect(bookings.statusTab('All')).toHaveAttribute('aria-selected', 'true');
    expect(await bookings.total()).toBeGreaterThan(0);
  });

  test('the Pending tab lists everything awaiting a decision', async () => {
    await bookings.selectStatus('Pending');

    const statuses = await bookings.column('Booking Status');
    expect(statuses.length).toBeGreaterThan(0);
    // By design it holds pending bookings and bookings with a pending
    // extension request (`Car Received PENDING EXTEND`), whatever their status.
    for (const status of statuses) {
      expect(status).toMatch(/^Pending\b|\bPENDING EXTEND$/i);
    }
    expect(await bookings.total()).toBe(await bookings.statusCount('Pending'));
  });

  test('the next page shows older bookings', async () => {
    const firstPage = (await bookings.column('Booking ID')).map(Number);

    await bookings.goToPage(2);

    const secondPage = (await bookings.column('Booking ID')).map(Number);
    expect(secondPage).toHaveLength(10);
    // A booking created meanwhile shifts the list by one, so compare order
    // rather than expecting two disjoint pages.
    expect(Math.max(...secondPage)).toBeLessThanOrEqual(Math.min(...firstPage));
  });

  test('the page size can be raised to 25', async () => {
    await bookings.setPageSize(25);

    await expect(bookings.rows).toHaveCount(25);
  });

  test('searching by booking number finds that booking', async () => {
    const [bookingId] = await bookings.column('Booking ID');
    const [bookingNo] = await bookings.column('Booking No.');

    await bookings.searchByBookingNo(bookingNo);

    // The search matches parts of ids and numbers, so other bookings may come
    // back too — but each must contain the term.
    expect((await bookings.listedBooking(bookingId))['Booking No.']).toBe(bookingNo);
    const ids = await bookings.column('Booking ID');
    const numbers = await bookings.column('Booking No.');
    ids.forEach((id, i) => expect(`${id} ${numbers[i]}`).toContain(bookingNo));
  });

  test('a booking opens on its details page', async ({ page }) => {
    const [bookingId] = await bookings.column('Booking ID');
    const [bookingNo] = await bookings.column('Booking No.');
    const [listedStatus] = await bookings.column('Booking Status');

    await bookings.openBooking(bookingId);

    const details = new BookingDetailsPage(page);
    await details.expectLoaded();
    expect(await details.detail('Booking Serial')).toBe(bookingId);
    expect(await details.detail('Booking No./ID')).toBe(bookingNo);
    expect(listedStatus.startsWith(await details.detail('Booking Status'))).toBeTruthy();
  });
});
