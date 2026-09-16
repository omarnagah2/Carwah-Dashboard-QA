import { expect, test } from '@playwright/test';
import { testData } from '../../src/config/test-data';
import { AddBookingPage } from '../../src/pages/add-booking.page';
import { BookingDetailsPage } from '../../src/pages/booking-details.page';
import { BookingsPage } from '../../src/pages/bookings.page';

/**
 * Creates a real booking on pre-prod for the dedicated test customer, and
 * leaves it there. Never retried: a retry would book again.
 */
test.describe('create booking', () => {
  test.describe.configure({ retries: 0 });

  test('an admin books a car for a customer', async ({ page }) => {
    const booking = testData.newBooking;
    const subtotal = booking.dailyPrice * booking.days;
    const vat = roundMoney(subtotal * 0.15);
    const due = roundMoney(subtotal + vat);
    const today = new Date();

    const form = new AddBookingPage(page);
    await form.open();
    await form.findCustomer(booking.customerMobile);
    await form.chooseCity(booking.city);
    await form.chooseAlly(booking.ally);
    await form.chooseBranch(booking.branch);
    await form.chooseCar(booking.car, booking.dailyPrice);

    await test.step('the form prices the default rental', async () => {
      await expect(form.cashPayment).toBeChecked();
      expect(await form.price('Price per day')).toBe(booking.dailyPrice);
      expect(await form.price(`Total days (${booking.days})`)).toBe(subtotal);
      expect(await form.price('Vat 15%')).toBe(vat);
      expect(await form.price('Due Amount')).toBe(due);
    });

    const rental = await form.rent();
    test.info().annotations.push({ type: 'created booking', description: rental.id });
    console.log(`Created booking ${rental.id} for ${booking.customerMobile}`);
    expect(rental.pickUpDate).toBe(isoDate(today));

    const list = new BookingsPage(page);
    await test.step('the booking is listed as pending', async () => {
      await expect(list.rows.first()).toBeVisible();
      await list.searchByBookingNo(rental.id);
      await expect(list.rows).toHaveCount(1);
      expect(await list.column('Booking ID')).toEqual([rental.id]);
      expect(await list.column('Customer')).toEqual([booking.customerName]);
      expect(await list.column('Ally')).toEqual([booking.ally]);
      expect(await list.column('branch')).toEqual([booking.branch]);
      expect(await list.column('Car')).toEqual([booking.listedCar]);
      expect(await list.column('Rented days')).toEqual([String(booking.days)]);
      expect(await list.column('Payment Method')).toEqual(['Cash']);
      expect(await list.column('Price/Day')).toEqual([String(booking.dailyPrice)]);
      expect((await list.column('Billing Amount')).map(Number)).toEqual([due]);
      expect((await list.column('Booking Status'))[0]).toMatch(/^Pending\b/);
    });

    await test.step('its details match what was booked', async () => {
      await list.openBooking(rental.id);
      const details = new BookingDetailsPage(page);
      await details.expectLoaded();
      expect(await details.detail('Booking Serial')).toBe(rental.id);
      expect(await details.detail('Booking Status')).toBe('Pending');
      expect(await details.detail('Mobile Number')).toBe(`966${booking.customerMobile}`);
      expect(await details.detail('Pickup Branch name')).toBe(booking.branch);
      expect(await details.detail('Total rental days')).toBe(String(booking.days));
      expect(Number(await details.detail('Grand Total'))).toBe(due);
    });
  });
});

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** YYYY-MM-DD in local time, as the API reports dates. */
function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
