import type { Page } from '@playwright/test';
import { testData } from '../../src/config/test-data';
import { expect, test } from '../../src/fixtures/test';
import { AddBookingV2Page } from '../../src/pages/add-booking-v2.page';
import { BookingDetailsPage } from '../../src/pages/booking-details.page';
import { EditBookingV2Page } from '../../src/pages/edit-booking-v2.page';
import { isOperation } from '../../src/utils/graphql';

const data = testData.addBooking;
const CLOSE_NOTE = 'Closed by the Carwah Dashboard automated test (edit booking scenarios)';
type Car = { city: string; ally: string; branch: string; car: string; dailyPrice: number; carId?: string };

/** "2026-09-25" as a local date, for the date picker. */
function day(isoDate: string, plusDays = 0): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d + plusDays);
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Edits on the refactored Edit Booking (/bookings/<id>/edit2). **Each
 * scenario books for real** on add2 — for the bookings' test customer — then
 * edits that booking, saves, and checks what was sent, the saved rental and
 * the booking details; the booking is **closed straight after** (afterEach),
 * as with the add scenarios. Never retried: a retry would book again.
 */
test.describe('edit booking (new page)', () => {
  test.describe.configure({ retries: 0 });

  const created: string[] = [];

  test.afterEach(async ({ page }) => {
    for (const bookingId of created.splice(0)) {
      const details = new BookingDetailsPage(page);
      await details.open(bookingId);
      if ((await details.detail('Booking Status')) !== 'Closed') {
        await details.changeStatus('Closed', { note: CLOSE_NOTE });
      }
      console.log(`Closed booking ${bookingId}`);
    }
  });

  /** Books `car` on add2 for the test customer and returns the booking's id. */
  async function book(
    page: Page,
    car: Car,
    { insurance = 'Standard', extras = [] }: { insurance?: 'Standard' | 'Full'; extras?: readonly string[] } = {},
  ): Promise<string> {
    const form = new AddBookingV2Page(page);
    await form.open();
    await form.findCustomer(data.customerMobile);
    await form.chooseCity(car.city);
    await form.chooseAlly(car.ally);
    await form.chooseBranch(car.branch);
    await form.chooseCar(car.car, car.dailyPrice);
    // Nothing is priced until an insurance is chosen, so extras come after it.
    await form.chooseInsurance(insurance);
    for (const extra of extras) {
      await form.addExtraService(extra);
    }
    const { bookingId } = await form.rent();
    created.push(bookingId);
    console.log(`Created booking ${bookingId}`);
    test.info().annotations.push({ type: 'created booking', description: bookingId });
    return bookingId;
  }

  /** Opens the booking's details and checks they carry the saved price. */
  async function openDetails(page: Page, bookingId: string, total: number): Promise<BookingDetailsPage> {
    return (await openDetailsWithRental(page, bookingId, total)).details;
  }

  /** The same, also returning the rental the details page is built from. */
  async function openDetailsWithRental(
    page: Page,
    bookingId: string,
    total: number,
  ): Promise<{ details: BookingDetailsPage; rental: Record<string, unknown> }> {
    const loaded = page.waitForResponse((r) => isOperation(r, 'GetRentalDetailsQuery'), { timeout: 30_000 });
    const details = new BookingDetailsPage(page);
    await details.open(bookingId);
    const rental = (await (await loaded).json()).data.rentalDetails;
    expect(await details.detail('Grand Total')).toBe(String(total));
    expect(await details.aboutPrice('Due Amount')).toBe(total);
    return { details, rental };
  }

  test('moving the drop-off a day later reprices the booking', async ({ page }) => {
    const bookingId = await book(page, data.standard);
    const edit = new EditBookingV2Page(page);
    const before = await edit.openBooking(bookingId);
    const newDropoff = day(before.dropOffDate, 1);

    await edit.setDropoff(newDropoff, day(before.dropOffDate));
    // The new date cleared the company, branch and car (as on add2).
    await edit.chooseAlly(data.standard.ally);
    await edit.chooseBranch(data.standard.branch);
    await edit.chooseCar(data.standard.car, data.standard.dailyPrice);
    await edit.chooseInsurance('Standard');
    const price = edit.price();
    expect(price.numberOfDays).toBe(before.numberOfDays + 1);
    expect(await edit.summary()).toContain(`Due Amount ${price.totalPrice} SR`);

    const { sent, rental } = await edit.save();

    const [d, m, y] = [pad(newDropoff.getDate()), pad(newDropoff.getMonth() + 1), newDropoff.getFullYear()];
    expect(sent.dropOffDate).toBe(`${d}/${m}/${y}`);
    expect(rental).toMatchObject({ numberOfDays: before.numberOfDays + 1, totalBookingPrice: price.totalPrice });
    const details = await openDetails(page, bookingId, price.totalPrice);
    expect(await details.detail('Total rental days')).toBe(String(before.numberOfDays + 1));
    expect(await details.detail('Return date and time')).toMatch(new RegExp(`^${y}-${m}-${d} `));
    expect(await details.latestChange()).toEqual(expect.arrayContaining([expect.stringMatching(/^dropoff Date : /)]));
  });

  test('changing only the car, in the same branch', async ({ page }) => {
    const bookingId = await book(page, data.standard);
    const edit = new EditBookingV2Page(page);
    await edit.openBooking(bookingId);
    const other = data.fullInsurance;

    await edit.chooseCar(other.car, other.dailyPrice);
    await edit.chooseInsurance('Standard');

    const { sent, rental } = await edit.save();

    // Saved at the new car's own daily price (the summary shows another: known issue below).
    expect(sent.carId).toBe(other.carId);
    expect(rental).toMatchObject({ carId: other.carId, branchId: '161295', pricePerDay: other.dailyPrice });
    const details = await openDetails(page, bookingId, rental.totalBookingPrice as number);
    expect(await details.detail('Car ID')).toBe(other.carId);
    expect(await details.detail('Car Name')).toBe(other.car.replace(' - ', ' '));
  });

  test('changing the partner, branch and car', async ({ page }) => {
    const bookingId = await book(page, data.standard);
    const edit = new EditBookingV2Page(page);
    await edit.openBooking(bookingId);
    const other = data.handover;

    await edit.chooseAlly(other.ally);
    await edit.chooseBranch(other.branch);
    await edit.chooseCar(other.car, other.dailyPrice);
    await expect(edit.saveButton, 'Save waits for an insurance').toBeDisabled();
    await edit.chooseInsurance('Standard');

    const { sent, rental } = await edit.save();

    expect(sent.carId).not.toBe(data.standard.carId);
    expect(sent.dropOffBranchId, 'returned to the new branch').toBe(rental.branchId);
    // One partner's name starts with a stray Arabic mark ("ِAl-nagah").
    expect(rental.enAllyName).toMatch(new RegExp(`${other.ally}$`));
    expect(rental.pricePerDay, 'the new car’s daily price').toBe(other.dailyPrice);
    const details = await openDetails(page, bookingId, rental.totalBookingPrice as number);
    expect(await details.detail('Ally Name')).toMatch(new RegExp(`${other.ally}$`));
    expect(await details.detail('Branch Name')).toBe(other.branch);
    expect(await details.detail('Pickup Branch name')).toBe(other.branch);
  });

  test('changing the insurance from Standard to Full', async ({ page }) => {
    const car = data.fullInsurance;
    const bookingId = await book(page, car, { insurance: 'Standard' });
    const edit = new EditBookingV2Page(page);
    await edit.openBooking(bookingId);
    expect(await edit.summary()).not.toContain('Insurance (Full)');

    await edit.chooseInsurance('Full');
    const price = edit.price();
    expect(price.insuranceIncluded, 'Full insurance is charged').toBe(true);
    expect(await edit.summary()).toContain(`Insurance (Full) ${price.insuranceValue} SR`);

    const { rental } = await edit.save();

    expect(rental).toMatchObject({ totalBookingPrice: price.totalPrice });
    const details = await openDetails(page, bookingId, price.totalPrice);
    expect(await details.detail('Insurence type')).toBe('Full');
    expect(await details.aboutPrice('Insurance (Full)')).toBe(price.insuranceValue);
  });

  test('adding extra services', async ({ page }) => {
    const bookingId = await book(page, data.standard);
    const edit = new EditBookingV2Page(page);
    const before = await edit.openBooking(bookingId);

    for (const { name } of data.extraServices) {
      await edit.addExtraService(name);
    }
    const price = edit.price();
    // GPS once, Yelo Shield per day.
    expect(price.totalExtraServicesPrice).toBe(5 + 5 * before.numberOfDays);

    const { sent, rental } = await edit.save();

    expect(sent.allyExtraServices).toHaveLength(data.extraServices.length);
    expect(rental).toMatchObject({ totalBookingPrice: price.totalPrice });
    const details = await openDetails(page, bookingId, price.totalPrice);
    expect(await details.aboutPrice('GPS')).toBe(5);
    expect(await details.aboutPrice('Yelo Shield')).toBe(5 * before.numberOfDays);
  });

  test('removing an extra service', async ({ page }) => {
    const bookingId = await book(page, data.standard, { extras: ['GPS'] });
    const edit = new EditBookingV2Page(page);
    await edit.openBooking(bookingId);
    await expect(edit.extraService('GPS'), 'the booking’s service is ticked').toBeChecked();

    await edit.removeExtraService('GPS');
    const price = edit.price();
    expect(price.totalExtraServicesPrice).toBe(0);
    expect(await edit.summary()).not.toContain('GPS');

    const { sent, rental } = await edit.save();

    expect(sent.allyExtraServices).toEqual([]);
    expect(rental).toMatchObject({ totalBookingPrice: price.totalPrice });
    await openDetails(page, bookingId, price.totalPrice);
    const about = page.getByRole('heading', { name: 'About Price' }).locator('xpath=ancestor::div[contains(@class, "booking-details-card")][1]');
    await expect(about).not.toContainText('GPS');
  });

  test('switching the payment from cash to online', async ({ page }) => {
    const bookingId = await book(page, data.standard);
    const edit = new EditBookingV2Page(page);
    await edit.openBooking(bookingId);
    await expect(page.getByRole('radio', { name: 'Cash' })).toBeChecked();

    await edit.payOnline();
    const price = edit.price();

    const { sent, rental } = await edit.save();

    expect(sent.paymentMethod).toBe('ONLINE');
    expect(rental).toMatchObject({ paymentMethod: 'ONLINE', totalBookingPrice: price.totalPrice });
    const details = await openDetails(page, bookingId, price.totalPrice);
    expect(await details.detail('Payment Type')).toBe('ONLINE');
  });

  test('adding delivery to a booking', async ({ page }) => {
    const bookingId = await book(page, data.standard);
    const edit = new EditBookingV2Page(page);
    await edit.openBooking(bookingId);

    // Ticking Delivery clears the city, company and car (as on add2); the
    // city goes before the location, which it would otherwise move.
    await edit.tick('delivery');
    await edit.chooseCity(data.standard.city);
    await edit.deliverTo(data.delivery.place);
    await edit.chooseAlly(data.standard.ally);
    await edit.chooseBranch(data.standard.branch);
    await edit.chooseCar(data.standard.car, data.standard.dailyPrice);
    await edit.chooseInsurance('Standard');
    const price = edit.price();
    expect(price.deliveryPrice, 'a delivery fee').toBeGreaterThan(0);
    expect(await edit.summary()).toContain(`Car Delivery Fee ${price.deliveryPrice} SR`);

    const { sent, rental } = await edit.save();

    expect(sent.deliverType).toBe('one_way');
    expect(sent.deliverLat as number).toBeCloseTo(data.delivery.lat, 3);
    expect(sent.deliverLng as number).toBeCloseTo(data.delivery.lng, 3);
    expect(rental).toMatchObject({ totalBookingPrice: price.totalPrice });
    const { rental: saved } = await openDetailsWithRental(page, bookingId, price.totalPrice);
    expect(saved).toMatchObject({ deliverType: 'one_way', deliveryPrice: price.deliveryPrice });
    expect(saved.deliverLat as number).toBeCloseTo(data.delivery.lat, 3);
  });

  test('a note written on the edit page is kept with the booking', async ({ page }) => {
    const bookingId = await book(page, data.standard);
    const edit = new EditBookingV2Page(page);
    const before = await edit.openBooking(bookingId);
    const note = `Edited by the Carwah Dashboard automated test ${Date.now()}`;

    await edit.note.fill(note);
    const { sent, rental } = await edit.save();

    expect(sent.notes).toBe(note);
    expect(rental).toMatchObject({ totalBookingPrice: before.totalBookingPrice });
    const details = await openDetails(page, bookingId, before.totalBookingPrice);
    expect(await details.rentalNotes()).toContainEqual({ note, status: 'pending' });
  });

  test('after a car change the summary shows the price the booking is saved at', async ({ page }) => {
    test.fail(true, 'The summary keeps the old car’s daily price (99, with a 1% "No dis." discount) while Save charges the new car’s (100)');
    const bookingId = await book(page, data.standard);
    const edit = new EditBookingV2Page(page);
    await edit.openBooking(bookingId);
    const other = data.fullInsurance;

    await edit.chooseCar(other.car, other.dailyPrice);
    await edit.chooseInsurance('Standard');

    // Not saved: "changing only the car" saves the same change and checks the booking.
    expect(edit.price().pricePerDay).toBe(other.dailyPrice);
    expect(await edit.summary()).toContain(`Price per day ${other.dailyPrice} SR`);
  });
});
