import { expect, test } from '@playwright/test';
import { testData } from '../../src/config/test-data';
import { AddBookingPage } from '../../src/pages/add-booking.page';
import { BookingDetailsPage } from '../../src/pages/booking-details.page';
import { BookingsPage } from '../../src/pages/bookings.page';
import { EditBookingPage } from '../../src/pages/edit-booking.page';

/**
 * Writes to pre-prod: books one real booking for the dedicated test customer,
 * then walks it through every status to Closed, so each run leaves exactly one
 * closed booking behind. Serial — each step needs the one before — and never
 * retried, since a retry would book again.
 */
test.describe('booking lifecycle', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  const booking = testData.newBooking;
  const { subtotal, vat, due } = priceFor(booking.days);
  /** The edit step extends the booking by a day. */
  const extended = { days: booking.days + 1, ...priceFor(booking.days + 1) };
  const editNote = 'Extended one day by the Carwah Dashboard automated test';
  let bookingId: string;

  test('an admin books a car for a customer', async ({ page }) => {
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
    bookingId = rental.id;
    test.info().annotations.push({ type: 'created booking', description: rental.id });
    console.log(`Created booking ${rental.id} for ${booking.customerMobile}`);
    expect(rental.pickUpDate).toBe(isoDate(today));

    const list = new BookingsPage(page);
    await test.step('the booking is listed as pending', async () => {
      await expect(list.rows.first()).toBeVisible();
      await list.searchByBookingNo(rental.id);
      const listed = await list.listedBooking(rental.id);
      expect(listed['Customer']).toBe(booking.customerName);
      expect(listed['Ally']).toBe(booking.ally);
      expect(listed['branch']).toBe(booking.branch);
      expect(listed['Car']).toBe(booking.listedCar);
      expect(listed['Rented days']).toBe(String(booking.days));
      expect(listed['Payment Method']).toBe('Cash');
      expect(listed['Price/Day']).toBe(String(booking.dailyPrice));
      expect(Number(listed['Billing Amount'])).toBe(due);
      expect(listed['Booking Status']).toMatch(/^Pending\b/);
      expect(listed['Assign']).toBe('Assign To');
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

  test('assigning it to customer care', async ({ page }) => {
    const details = new BookingDetailsPage(page);
    await details.open(bookingId);
    expect(await details.assignedTo()).toBe('');
    expect(await details.preselectedAssignee()).toBe('');

    await details.assignTo(booking.assignee);

    await details.open(bookingId);
    expect(await details.assignedTo()).toBe(booking.assignee);
    expect(await details.preselectedAssignee()).toBe(booking.assignee);

    const list = new BookingsPage(page);
    await list.open();
    await list.searchByBookingNo(bookingId);
    // The cell holds the Assign To button followed by the assignee.
    expect((await list.listedBooking(bookingId))['Assign']).toBe(`Assign To ${booking.assignee}`);
  });

  test('extending it by a day', async ({ page }) => {
    const details = new BookingDetailsPage(page);
    await details.open(bookingId);
    const returning = await details.detail('Return date and time');
    const currentReturn = new Date(returning.slice(0, 10) + 'T00:00:00');
    const newReturn = addDays(currentReturn, 1);

    await details.edit();
    const form = new EditBookingPage(page);
    await form.expectLoaded();
    await test.step('the form opens with the booking as it is', async () => {
      await expect(form.pickupCity).toHaveValue(booking.city);
      await expect(form.cashPayment).toBeChecked();
      expect(await form.price(`Total days (${booking.days})`)).toBe(subtotal);
      expect(await form.price('Due Amount')).toBe(due);
    });

    await form.setDropoffDate(currentReturn, newReturn);
    await test.step('the price follows the new length', async () => {
      expect(await form.price(`Total days (${extended.days})`)).toBe(extended.subtotal);
      expect(await form.price('Vat 15%')).toBe(extended.vat);
      expect(await form.price('Due Amount')).toBe(extended.due);
    });
    await form.note.fill(editNote);
    await form.save();

    await details.open(bookingId);
    await test.step('the booking carries the change', async () => {
      expect((await details.detail('Return date and time')).slice(0, 10)).toBe(isoDate(newReturn));
      expect(await details.detail('Total rental days')).toBe(String(extended.days));
      expect(Number(await details.detail('Price before tax'))).toBe(extended.subtotal);
      expect(Number(await details.detail('Tax'))).toBe(extended.vat);
      expect(Number(await details.detail('Grand Total'))).toBe(extended.due);
      expect(await details.detail('Booking Status')).toBe('Pending');
    });
    await test.step('the timeline records it', async () => {
      const change = await details.latestChange();
      expect(change).toContain(`dropoff Date : ${isoDate(newReturn)}`);
      expect(change).toContain(`notes : ${editNote}`);
      expect(change).toContain(`total_booking_price : ${extended.due}`);
    });
  });

  test('confirming it', async ({ page }) => {
    const details = new BookingDetailsPage(page);
    await details.open(bookingId);

    await details.changeStatus('Confirmed');

    await details.open(bookingId);
    expect(await details.detail('Booking Status')).toBe('Confirmed');
  });

  test('handing the car over', async ({ page }) => {
    const details = new BookingDetailsPage(page);
    await details.open(bookingId);

    await details.changeStatus('Car Received');

    await details.open(bookingId);
    expect(await details.detail('Booking Status')).toBe('Car Received');
  });

  // Add Note is only offered once the car is handed over, so the note comes
  // after that.
  test('noting it', async ({ page }) => {
    const note = 'Note added by the Carwah Dashboard automated test';
    const details = new BookingDetailsPage(page);
    await details.open(bookingId);
    // The note saved with the edit is listed with the others.
    expect(await details.rentalNotes()).toEqual([{ note: editNote, status: 'pending' }]);

    await details.addNote(note);

    await details.open(bookingId);
    // Each note keeps the status the booking had when it was written.
    expect(await details.rentalNotes()).toEqual([
      { note: editNote, status: 'pending' },
      { note, status: 'car_received' },
    ]);
  });

  test('invoicing it', async ({ page }) => {
    const details = new BookingDetailsPage(page);
    await details.open(bookingId);

    await details.changeStatus('Invoiced', { grandTotal: extended.due });

    await details.open(bookingId);
    expect(await details.detail('Booking Status')).toBe('Invoiced');
    expect(await details.detail('Booking SubStatus')).toBe('Pending review');
    expect(Number(await details.detail('Grand Total'))).toBe(extended.due);
  });

  test('closing it', async ({ page }) => {
    const details = new BookingDetailsPage(page);
    await details.open(bookingId);

    await details.changeStatus('Closed');

    await details.open(bookingId);
    expect(await details.detail('Booking Status')).toBe('Closed');
    // Closed is final: there is nothing left to change it to.
    await expect(details.changeStatusButton).toHaveCount(0);
  });
});

/** What the forms charge for `days` of the pinned car: 15% VAT on top. */
function priceFor(days: number): { subtotal: number; vat: number; due: number } {
  const subtotal = testData.newBooking.dailyPrice * days;
  const vat = roundMoney(subtotal * 0.15);
  return { subtotal, vat, due: roundMoney(subtotal + vat) };
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function addDays(date: Date, days: number): Date {
  const moved = new Date(date);
  moved.setDate(moved.getDate() + days);
  return moved;
}

/** YYYY-MM-DD in local time, as the API reports dates. */
function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
