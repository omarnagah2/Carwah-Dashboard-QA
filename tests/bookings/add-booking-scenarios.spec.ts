import type { Page } from '@playwright/test';
import { testData } from '../../src/config/test-data';
import { expect, test } from '../../src/fixtures/test';
import { AddBookingV2Page, type RentPrice } from '../../src/pages/add-booking-v2.page';
import { BookingDetailsPage } from '../../src/pages/booking-details.page';
import { CarDetailsPage } from '../../src/pages/car-details.page';
import { CarsPage } from '../../src/pages/cars.page';
import { isOperation } from '../../src/utils/graphql';

const data = testData.addBooking;
const CLOSE_NOTE = 'Closed by the Carwah Dashboard automated test (add booking scenarios)';

/**
 * The form's default pickup is two hours from now in Riyadh, and its
 * drop-off three days after; late in the evening that is already tomorrow
 * there. Returns the pickup day plus `days`, as a local date for the picker.
 */
function fromPickup(days: number): Date {
  const pickup = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const [y, m, d] = pickup.toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }).split('-').map(Number);
  return new Date(y, m - 1, d + days);
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The API's own sums, which the About price summary shows: the rent after
 * any discount plus everything added (extras, unlimited KM, insurance,
 * delivery, handover), then 15% VAT.
 */
function expectConsistent(price: RentPrice): void {
  expect(money(price.priceBeforeInsurance + price.addsPrice), 'price before tax').toBe(price.priceBeforeTax);
  expect(money(price.priceBeforeTax * 0.15), 'VAT').toBe(price.taxValue);
  expect(money(price.priceBeforeTax + price.taxValue), 'total').toBe(price.totalPrice);
}

/** Opens a created booking and returns the rental the details page is built from. */
async function openCreated(page: Page, bookingId: string): Promise<Record<string, unknown>> {
  const loaded = page.waitForResponse((r) => isOperation(r, 'GetRentalDetailsQuery'), { timeout: 30_000 });
  await new BookingDetailsPage(page).open(bookingId);
  return (await (await loaded).json()).data.rentalDetails;
}

/** Holds CreateBooking back, for specs that must not book; returns what it would have sent. */
async function blockBooking(page: Page): Promise<Record<string, unknown>[]> {
  const held: Record<string, unknown>[] = [];
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON();
    if (body?.operationName === 'CreateBooking') {
      held.push(body.variables);
      await route.abort();
      return;
    }
    await route.fallback();
  });
  return held;
}

/**
 * Every add-booking flow on the refactored page. **Each scenario books for
 * real** — for the bookings' test customer — checks the price, what was sent
 * and the booking, and the booking is **closed straight after** (afterEach),
 * as agreed with the owner. Never retried: a retry would book again. The
 * specs after them check known issues without booking anything.
 */
test.describe('add booking (new page): scenarios', () => {
  // Booking, checking the details and closing (for rent to own, switching
  // the car back on) can run past the default minute on a slow pre-prod,
  // and a close cut short leaves the booking open.
  test.describe.configure({ retries: 0, timeout: 180_000 });

  const created: string[] = [];
  let form: AddBookingV2Page;

  test.beforeEach(async ({ page }) => {
    form = new AddBookingV2Page(page);
    await form.open();
    await form.findCustomer(data.customerMobile);
  });

  /** Rent-to-own cars booked by the current test, to switch back on after closing. */
  const booked: { carId: string; ally: string }[] = [];

  test.afterEach(async ({ page }) => {
    // Closing is the dashboard's cancel (confirmed by the owner).
    for (const bookingId of created.splice(0)) {
      const details = new BookingDetailsPage(page);
      await details.open(bookingId);
      if ((await details.detail('Booking Status')) !== 'Closed') {
        await details.changeStatus('Closed', { note: CLOSE_NOTE });
      }
      console.log(`Closed booking ${bookingId}`);
    }
    // Booking a rent-to-own car switches it off, and closing the booking
    // does not switch it back — a backend bug the owner reports. Until it is
    // fixed the car is switched back on here, as the owner asked.
    for (const { carId, ally } of booked.splice(0)) {
      const car = new CarDetailsPage(page);
      await car.open(carId);
      const status = await car.detail('Car Availability Status');
      if (status === 'Active') {
        console.log(`Car ${carId} is active again after the close — the backend bug may be fixed`);
        continue;
      }
      console.log(`Car ${carId} is ${status} after the close (known backend bug); switching it back on`);
      test.info().annotations.push({ type: 'known issue', description: `rent-to-own car ${carId} stayed ${status} after its booking was closed` });
      const cars = new CarsPage(page);
      await cars.open();
      await cars.filters.open();
      await cars.filters.choose('Ally Name', ally);
      await cars.filters.choose('Car Availability Status', 'Inactive');
      await cars.search();
      await cars.setAvailable(carId, true);
      await car.open(carId);
      expect(await car.detail('Car Availability Status'), `car ${carId} switched back on`).toBe('Active');
    }
  });

  async function rent(): Promise<{ bookingId: string; sent: Record<string, unknown> }> {
    const result = await form.rent();
    created.push(result.bookingId);
    console.log(`Created booking ${result.bookingId}`);
    test.info().annotations.push({ type: 'created booking', description: result.bookingId });
    return result;
  }

  async function standardCar(car: typeof data.standard = data.standard): Promise<void> {
    await form.chooseCity(car.city);
    await form.chooseAlly(car.ally);
    await form.chooseBranch(car.branch);
    await form.chooseCar(car.car, car.dailyPrice);
  }

  test('a daily booking, no extras, Standard insurance', async ({ page }) => {
    await standardCar();
    await form.chooseInsurance('Standard');
    const price = form.price();
    expectConsistent(price);
    expect(price.numberOfDays).toBe(3);
    expect(price.pricePerDay).toBe(data.standard.dailyPrice);
    expect(price.totalExtraServicesPrice).toBe(0);
    expect(await form.summary()).toContain(`Due Amount ${price.totalPrice} SR`);

    const { bookingId, sent } = await rent();

    expect(sent).toMatchObject({
      carId: data.standard.carId,
      paymentMethod: 'CASH',
      deliverType: 'no_delivery',
      allyExtraServices: [],
      withInstallment: false,
    });
    const rental = await openCreated(page, bookingId);
    expect(rental).toMatchObject({
      status: 'pending',
      isRentToOwn: false,
      deliverType: 'no_delivery',
      insuranceName: 'Standard',
      numberOfDays: 3,
      totalBookingPrice: price.totalPrice,
    });
    const details = new BookingDetailsPage(page);
    expect(await details.detail('Booking type')).toBe('Daily');
    expect(Number(await details.detail('Grand Total'))).toBe(price.totalPrice);
  });

  test('a daily booking with extra services charged per rent and per day', async ({ page }) => {
    await standardCar();
    await form.chooseInsurance('Standard');
    const before = form.price();
    for (const service of data.extraServices) {
      await form.addExtraService(service.name);
    }
    const price = form.price();
    expectConsistent(price);
    const extras = data.extraServices.reduce((sum, s) => sum + (s.per === 'Day' ? s.price * price.numberOfDays : s.price), 0);
    expect(price.totalExtraServicesPrice).toBe(extras);
    expect(money(price.totalPrice - before.totalPrice)).toBe(money(extras * 1.15));
    const summary = await form.summary();
    for (const service of data.extraServices) {
      expect(summary).toContain(service.name);
    }

    const { bookingId, sent } = await rent();

    expect(sent.allyExtraServices).toHaveLength(data.extraServices.length);
    const rental = await openCreated(page, bookingId);
    expect(rental.totalBookingPrice).toBe(price.totalPrice);
    const booked = (rental.rentalExtraServices as { title?: string; enTitle?: string; extraServiceTitle?: string }[]) ?? [];
    expect(booked, 'the booking keeps its extra services').toHaveLength(data.extraServices.length);
  });

  test('a daily booking without Unlimited KM', async ({ page }) => {
    await standardCar();
    await form.chooseInsurance('Standard');
    // Ticked by default on a car that offers it (by design), at the car's fee.
    await expect(form.unlimitedKm).toBeChecked();
    const withIt = form.price();
    expect(withIt.totalUnlimitedFee, 'the Dzire charges Unlimited KM').toBeGreaterThan(0);

    await form.dropUnlimitedKm();

    const price = form.price();
    expectConsistent(price);
    expect(price.totalUnlimitedFee).toBe(0);
    expect(price.totalPrice).toBe(money(withIt.totalPrice - withIt.totalUnlimitedFee * 1.15));
    expect(await form.summary()).not.toContain('Unlimited KM');

    const { bookingId, sent } = await rent();

    expect(sent.isUnlimited).toBe(false);
    const rental = await openCreated(page, bookingId);
    expect(rental).toMatchObject({ totalUnlimitedFee: 0, totalBookingPrice: price.totalPrice });
  });

  test('a daily booking with Full insurance', async ({ page }) => {
    await standardCar(data.fullInsurance);
    expect(await form.insuranceOptions()).toEqual(expect.arrayContaining(['Full', 'Standard']));
    await form.chooseInsurance('Full');
    const price = form.price();
    expectConsistent(price);
    expect(price.insuranceIncluded).toBe(true);
    expect(price.insuranceValue).toBeGreaterThan(0);
    expect(await form.summary()).toContain('Insurance (Full)');

    const { bookingId, sent } = await rent();

    expect(sent.carId).toBe(data.fullInsurance.carId);
    const rental = await openCreated(page, bookingId);
    expect(rental).toMatchObject({ insuranceName: 'Full', totalBookingPrice: price.totalPrice });
  });

  test('a delivery booking', async ({ page }) => {
    await form.tick('delivery');
    // City first: choosing it after the location moves the point back (by design).
    await form.chooseCity(data.standard.city);
    await form.deliverTo(data.delivery.place);
    await form.chooseAlly(data.standard.ally);
    await form.chooseBranch(data.standard.branch);
    await form.chooseCar(data.standard.car, data.standard.dailyPrice);
    await form.chooseInsurance('Standard');
    const price = form.price();
    expectConsistent(price);
    expect(price.deliveryPrice, 'a delivery fee').toBeGreaterThan(0);
    expect(await form.summary()).toContain(`Car Delivery Fee ${price.deliveryPrice} SR`);

    const { bookingId, sent } = await rent();

    expect(sent.deliverType).toBe('one_way');
    expect(sent.deliveryPrice).toBe(price.deliveryPrice);
    expect(sent.deliverLat as number).toBeCloseTo(data.delivery.lat, 3);
    expect(sent.deliverLng as number).toBeCloseTo(data.delivery.lng, 3);
    const rental = await openCreated(page, bookingId);
    expect(rental).toMatchObject({ deliverType: 'one_way', deliveryPrice: price.deliveryPrice, totalBookingPrice: price.totalPrice });
    expect(rental.deliverLat as number).toBeCloseTo(data.delivery.lat, 3);
  });

  test('a handover in another branch, in another city', async ({ page }) => {
    const handover = data.handover;
    await form.tick('handover');
    // Haleef B is shut on Fridays and keeps short shifts on Saturdays, and
    // the API refuses a return then ("the drop off branch is not opened
    // this day!"), so a return that falls on either moves to the Sunday.
    let days = 3;
    while ([5, 6].includes(fromPickup(days).getDay())) {
      days++;
    }
    if (days !== 3) {
      await form.setDropoff(fromPickup(days), fromPickup(3));
    }
    await form.chooseCity(handover.pickupCity);
    await form.chooseDropoffCity(handover.dropoffCity);
    await form.chooseAlly(handover.ally);
    await form.chooseBranch(handover.branch);
    await form.chooseCar(handover.car, handover.dailyPrice);
    await form.chooseDropoffBranch(handover.dropoffBranch);
    await expect(form.handoverFee).toHaveValue(String(handover.fee));
    await form.chooseInsurance('Standard');
    const price = form.price();
    expectConsistent(price);
    expect(price.handoverPrice).toBe(handover.fee);
    expect(await form.summary()).toContain(`Car handover fee ${handover.fee} SR`);

    const { bookingId, sent } = await rent();

    expect(sent.handoverPrice).toBe(handover.fee);
    const rental = await openCreated(page, bookingId);
    expect(rental).toMatchObject({ handoverPrice: handover.fee, enDropOffCityName: handover.dropoffCity, totalBookingPrice: price.totalPrice });
    expect(rental.dropOffBranchId, 'returned to another branch').not.toBe(rental.branchId);
    const details = new BookingDetailsPage(page);
    expect(await details.detail('Pickup Branch name')).toBe(handover.branch);
    expect(await details.detail('Return Location')).toBe(handover.dropoffCity);
    // The details page names the pickup branch as the return branch — a
    // known issue, checked on its own below.
  });

  test('a monthly booking', async ({ page }) => {
    await form.bookingType('Monthly');
    await standardCar();
    await form.chooseInsurance('Standard');
    await form.chooseMonths('One Month');
    await expect.poll(() => form.price().numberOfDays).toBe(30);
    const price = form.price();
    expectConsistent(price);
    // A month is charged at the car's monthly rate, shown as a discount.
    expect(price.pricePerDay).toBe(77);
    expect(price.discountType).toBe('Monthly dis.');
    expect(money(price.priceBeforeDiscount - price.discountValue)).toBe(price.priceBeforeInsurance);

    const { bookingId } = await rent();

    const rental = await openCreated(page, bookingId);
    expect(rental).toMatchObject({ numberOfDays: 30, pricePerDay: 77, totalBookingPrice: price.totalPrice, withInstallment: false });
  });

  test('a monthly booking paid in installments', async ({ page }) => {
    await form.bookingType('Monthly');
    await form.installments.check();
    await standardCar();
    await form.chooseInsurance('Standard');
    const price = form.price();
    expectConsistent(price);
    const months = Math.round(price.numberOfDays / 30);
    expect(price.installmentsBreakdown, 'one installment a month').toHaveLength(months);
    expect(money(price.installmentsBreakdown!.reduce((sum, i) => sum + i.amount, 0))).toBe(price.totalPrice);

    const { bookingId, sent } = await rent();

    expect(sent.withInstallment).toBe(true);
    const rental = await openCreated(page, bookingId);
    expect(rental).toMatchObject({ withInstallment: true, totalBookingPrice: price.totalPrice });
  });

  test('a rent-to-own booking', async ({ page }) => {
    const rto = data.rentToOwn;
    await form.bookingType('Rent To Own');
    await form.chooseCity(rto.city);
    await form.chooseAlly(rto.ally);
    await form.chooseBranch(rto.branch);
    await form.chooseCar(rto.car, rto.dailyPrice);
    await form.choosePlan();
    const price = form.price();
    expectConsistent(price);
    const plan = price.rentToOwnInstallmentBreakdown!;
    expect(plan, 'the plan’s installments').not.toBeNull();
    const summary = await form.summary();
    expect(summary).toContain(`1st installment ${plan.firstPayment} SR`);
    expect(summary).toContain(`Final Installment ${plan.finalInstallment} SR`);

    const { bookingId, sent } = await rent();
    booked.push({ carId: rto.carId, ally: rto.ally });

    expect(sent.ownCarPlanId, 'the chosen plan').toBeTruthy();
    const rental = await openCreated(page, bookingId);
    expect(rental).toMatchObject({ isRentToOwn: true, totalBookingPrice: price.totalPrice });

    // The form shows the whole price as Due Amount, by design; the booking
    // details split it into the plan and its installments.
    const details = new BookingDetailsPage(page);
    expect(await details.aboutPrice('1st installment')).toBe(plan.firstPayment);
    expect(await details.aboutPrice('Monthly installment')).toBe(plan.monthlyInstallment);
    expect(await details.aboutPrice('Final Installment')).toBe(plan.finalInstallment);
    expect(await details.aboutPrice('Total')).toBe(price.priceBeforeTax);
    expect(await details.aboutPrice('Vat 15%')).toBe(price.taxValue);
    expect(await details.aboutPrice('Grand Total + Vat')).toBe(price.totalPrice);
    const count = price.installmentsBreakdown!.length;
    expect(await details.aboutPrice(`Completed Payments (0/${count})`)).toBe(0);
    expect(await details.aboutPrice('Remaining Due')).toBe(price.totalPrice);
    expect(await details.detail('Grand Total')).toBe(String(price.totalPrice));

    // Each installment with its VAT (2300, 575, 575, 1150 on the 3-month
    // plan), adding up to the total; the first is due now, in cash.
    const installments = await details.rentalInstallments();
    expect(installments.map((i) => i.amount)).toEqual(price.installmentsBreakdown!.map((i) => i.amount));
    expect(money(installments.reduce((sum, i) => sum + i.amount, 0))).toBe(price.totalPrice);
    expect(installments.map((i) => i.status)).toEqual(['Not-Collected', ...Array(count - 1).fill('Upcoming')]);
    expect(installments[0].paymentMethod).toBe('Cash');
    // The Due Date column shows each installment's date, a month apart.
    const dueDates = (rental.installments as { dueDate: string }[]).map((i) => i.dueDate.slice(0, 10).split('-').reverse().join('-'));
    expect(installments.map((i) => i.dueDate)).toEqual(dueDates);
  });

  test('a booking at a suggested daily price', async ({ page }) => {
    await standardCar();
    await form.chooseInsurance('Standard');
    const listed = form.price();

    await form.suggestedPrice.fill(String(data.suggestedPrice));
    const { bookingId, sent } = await rent();

    expect(sent.suggestedPrice).toBe(data.suggestedPrice);
    const rental = await openCreated(page, bookingId);
    // Charged at the suggested price, as Update Price does on a booking.
    const beforeTax = money(data.suggestedPrice * listed.numberOfDays + listed.addsPrice);
    expect(rental).toMatchObject({
      suggestedPrice: data.suggestedPrice,
      priceBeforeTax: beforeTax,
      totalBookingPrice: money(beforeTax * 1.15),
    });
  });

  test('a booking paid online', async ({ page }) => {
    await standardCar();
    await form.chooseInsurance('Standard');
    await form.payOnline();
    const price = form.price();
    expectConsistent(price);

    const { bookingId, sent } = await rent();

    expect(sent.paymentMethod).toBe('ONLINE');
    const rental = await openCreated(page, bookingId);
    expect(rental).toMatchObject({ paymentMethod: 'ONLINE', isPaid: false, totalBookingPrice: price.totalPrice });
  });
});

/** The form's own rules, checked without booking (Rent is never pressed). */
test.describe('add booking (new page): checks without booking', () => {
  let form: AddBookingV2Page;

  test.beforeEach(async ({ page }) => {
    form = new AddBookingV2Page(page);
    await form.open();
    await form.findCustomer(data.customerMobile);
    await form.chooseCity(data.standard.city);
    await form.chooseAlly(data.standard.ally);
    await form.chooseBranch(data.standard.branch);
    await form.chooseCar(data.standard.car, data.standard.dailyPrice);
  });

  test('Rent stays disabled until an insurance is chosen', async () => {
    await expect(form.rentButton).toBeDisabled();

    await form.chooseInsurance('Standard');

    await expect(form.rentButton).toBeEnabled();
  });

  test('seven days are charged at the weekly rate', async () => {
    await form.setDropoff(fromPickup(7), fromPickup(3));
    // The new date cleared the company, branch and car; the city stays.
    await form.chooseAlly(data.standard.ally);
    await form.chooseBranch(data.standard.branch);
    await form.chooseCar(data.standard.car, data.standard.dailyPrice);
    await form.chooseInsurance('Standard');

    const price = form.price();
    expectConsistent(price);
    expect(price.numberOfDays).toBe(7);
    // Suzuki Dzire: 99 a day, 88 a week-day.
    expect(price.pricePerDay).toBe(88);
    expect(money(price.priceBeforeDiscount - price.discountValue)).toBe(88 * 7);
  });

  test('an unknown coupon is refused', async () => {
    await form.chooseInsurance('Standard');
    const before = form.price().totalPrice;

    const message = await form.applyCoupon('NOT-A-REAL-COUPON');

    await expect(message.first()).toHaveText('Invalid coupon');
    expect(form.price().totalPrice).toBe(before);
  });
});

/**
 * Known issues on the new page, checked without booking: CreateBooking is
 * held back wherever Rent is pressed.
 */
test.describe('add booking (new page): known issues', () => {
  let form: AddBookingV2Page;

  test.beforeEach(async ({ page }) => {
    form = new AddBookingV2Page(page);
  });

  async function start(): Promise<void> {
    await form.open();
    await form.findCustomer(data.customerMobile);
  }

  test('the page loads without script errors', async ({ page }) => {
    test.fail(true, 'Opening /bookings/add2 throws "Cannot read properties of undefined (reading \'push\')"');
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text().split('\n')[0]);
      }
    });
    await start();
    expect(errors).toEqual([]);
  });

  test('only active partners are offered', async ({ page }) => {
    test.fail(true, 'Inactive partners (isActive: false) are listed, e.g. "abdelrhman ally" in Riyadh; reported by the owner');
    const offered = page.waitForResponse(
      (r) => isOperation(r, 'AvailableAllyCompanies') && r.request().postDataJSON().variables.cityId === 1,
      { timeout: 30_000 },
    );
    await start();
    await form.chooseCity(data.standard.city);
    const partners: { enName: string; isActive: boolean }[] = (await (await offered).json()).data.availableAllyCompanies.collection;

    expect(partners.length).toBeGreaterThan(0);
    expect(partners.filter((p) => !p.isActive).map((p) => p.enName)).toEqual([]);
  });

  test('a handover booking names its return branch', async ({ page }) => {
    test.fail(true, 'Booking details show the pickup branch as "Return branch name", though the booking returns elsewhere');
    // Booked by the handover scenario on 2026-09-21 and closed; read only.
    const rental = await openCreated(page, data.handover.bookedExample);
    expect(rental.dropOffBranchId).not.toBe(rental.branchId);
    expect(await new BookingDetailsPage(page).detail('Return branch name')).toBe(data.handover.dropoffBranch);
  });

  test('changing the handover fee reprices the booking', async ({ page }) => {
    test.fail(true, 'A new handover fee is sent with Rent but the summary keeps the old one — the customer sees a different price');
    const held = await blockBooking(page);
    const handover = data.handover;
    await start();
    await form.tick('handover');
    await form.chooseCity(handover.pickupCity);
    await form.chooseDropoffCity(handover.dropoffCity);
    await form.chooseAlly(handover.ally);
    await form.chooseBranch(handover.branch);
    await form.chooseCar(handover.car, handover.dailyPrice);
    await form.chooseDropoffBranch(handover.dropoffBranch);
    await form.chooseInsurance('Standard');

    await form.handoverFee.fill('50');
    await form.rentButton.click();
    await expect.poll(() => held.length).toBe(1);

    expect(held[0].handoverPrice).toBe(50);
    await expect.poll(() => form.summary(), { timeout: 5_000 }).toContain('Car handover fee 50 SR');
  });

  // Was a known issue (Rent enabled with no plan); fixed on 21/09, kept as a check.
  // Rent to own takes no insurance, so the plan is the only thing Rent waits for.
  test('Rent waits until a rent-to-own plan is chosen', async () => {
    const rto = data.rentToOwnPreview;
    await start();
    await form.bookingType('Rent To Own');
    await form.chooseCity(rto.city);
    await form.chooseAlly(rto.ally);
    await form.chooseBranch(rto.branch);
    await form.chooseCar(rto.car, rto.dailyPrice);
    await expect(form.rentButton).toBeDisabled({ timeout: 3_000 });
  });
});
