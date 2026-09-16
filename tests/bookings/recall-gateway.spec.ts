import { expect, test } from '../../src/fixtures/test';
import { BookingDetailsPage } from '../../src/pages/booking-details.page';
import { BookingsPage } from '../../src/pages/bookings.page';

/**
 * Recall Gateway works on customers' own online bookings — the lifecycle's
 * cash bookings never show it — so these specs pick bookings from the Pending
 * tab. The recall spec clicks it on one real booking per run (agreed with the
 * suite's owner): all it does is bring the payment status in line with the
 * gateway.
 */
test.describe('recall gateway', () => {
  /** How many Online "Not Paid" bookings to open looking for a pending payment. */
  const MAX_CANDIDATES = 5;

  async function pendingBookings(bookings: BookingsPage): Promise<{ id: string; payment: string }[]> {
    await bookings.open();
    await bookings.selectStatus('Pending');
    const ids = await bookings.column('Booking ID');
    const payments = await bookings.column('Payment Method');
    return ids.map((id, i) => ({ id, payment: payments[i] }));
  }

  test('the icon is only offered while an online payment is pending', async ({ page }) => {
    const listed = await pendingBookings(new BookingsPage(page));
    const details = new BookingDetailsPage(page);

    for (const kind of [/^Online Paid$/, /^Cash\b/]) {
      const booking = listed.find((b) => kind.test(b.payment));
      if (!booking) {
        continue;
      }
      await test.step(`${booking.payment} (${booking.id})`, async () => {
        await details.open(booking.id);
        expect(await details.detail('Payment Status')).not.toBe('Pending');
        await expect(details.recallGatewayIcon).toHaveCount(0);
      });
    }
  });

  test('recalling the gateway refreshes a pending payment', async ({ page }) => {
    const listed = await pendingBookings(new BookingsPage(page));
    const details = new BookingDetailsPage(page);

    // The list shows a pending gateway payment as "Not Paid"; only the
    // details page tells the two apart.
    let bookingId: string | undefined;
    for (const booking of listed.filter((b) => b.payment === 'Online Not Paid').slice(0, MAX_CANDIDATES)) {
      await details.open(booking.id);
      if ((await details.detail('Payment Status')) === 'Pending') {
        bookingId = booking.id;
        break;
      }
    }
    test.skip(!bookingId, 'No online booking with a pending gateway payment on the Pending tab');
    test.info().annotations.push({ type: 'recalled booking', description: bookingId });
    await expect(details.recallGatewayIcon).toBeVisible();

    await details.recallGateway();

    await details.open(bookingId!);
    const status = await details.detail('Payment Status');
    console.log(`Recalled the gateway for booking ${bookingId}: payment ${status}`);
    // The icon stays exactly as long as the gateway still reports pending.
    await expect(details.recallGatewayIcon).toHaveCount(status === 'Pending' ? 1 : 0);
    if (status === 'Paid') {
      expect(await details.detail('Paid by')).toMatch(/^customer - /);
    }
  });
});
