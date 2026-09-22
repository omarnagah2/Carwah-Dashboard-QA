import { expect, test } from '../../src/fixtures/test';
import { testData } from '../../src/config/test-data';
import { CouponDetailsPage } from '../../src/pages/coupon-details.page';
import { CouponFormPage } from '../../src/pages/coupon-form.page';
import { CouponsPage } from '../../src/pages/coupons.page';

const coupon = testData.coupons.newCoupon();

/**
 * **This spec writes to pre-prod: every run creates one real coupon**, edits
 * it and deactivates it at the end. A coupon cannot be deleted — the
 * dashboard has no delete and neither has the API — so one is left behind
 * each time, which is why the spec is tagged **@creates-coupon** and kept out
 * of ordinary runs (`grepInvert` in the config):
 *
 * ```
 * RUN_CREATE_COUPON=1 npx playwright test --grep @creates-coupon
 * ```
 *
 * The steps are serial and never retried; `afterAll` deactivates the coupon
 * even when a step fails, so nothing is left usable on a real booking.
 */
test.describe('coupon lifecycle @creates-coupon', () => {
  test.describe.configure({ mode: 'serial', retries: 0, timeout: 180_000 });

  let couponId: string;

  test.afterAll(async ({ browser }) => {
    if (!couponId) {
      return;
    }
    const page = await browser.newPage();
    const coupons = new CouponsPage(page);
    await coupons.open();
    await coupons.filters.open();
    await coupons.filters.code.fill(coupon.code);
    const { coupons: found } = await coupons.search();
    if (found[0]?.isActive) {
      await coupons.deactivate(couponId);
      console.log(`Deactivated coupon ${couponId}`);
    }
    await page.close();
  });

  test('creates a coupon', async ({ page }) => {
    const form = new CouponFormPage(page);
    await form.openAdd();
    await expect(form.saveButton).toBeDisabled();

    await form.fill(coupon);
    await expect(form.saveButton).toBeEnabled();
    const { sent } = await form.save('CreateCoupons');

    expect(sent).toMatchObject({
      code: coupon.code,
      discountType: 'percentage',
      discountValue: coupon.discountValue,
      numOfUsages: coupon.numOfUsages,
      numOfUsagesPerUser: coupon.numOfUsagesPerUser,
      minRentPrice: coupon.minRentPrice,
      forNewCustomers: false,
      isMonthly: false,
      paymentMethod: 'ALL',
      allyCompanyIds: [],
      cityIds: [],
    });
    // The dates are sent as the form shows them, with the day's first and
    // last minute.
    expect(sent.startAt).toMatch(/T00:00:00$/);
    expect(sent.expireAt).toMatch(/T23:59:00$/);
  });

  test('the new coupon is listed', async ({ page }) => {
    const coupons = new CouponsPage(page);
    await coupons.open();
    await coupons.filters.open();
    await coupons.filters.code.fill(coupon.code);

    const { coupons: found, total } = await coupons.search();

    expect(total).toBe(1);
    expect(found[0]).toMatchObject({
      code: coupon.code,
      discountType: 'Percentage',
      discountValue: coupon.discountValue,
      numOfUsages: coupon.numOfUsages,
      isActive: true,
    });
    couponId = found[0].id;
    console.log(`Created coupon ${couponId} (${coupon.code})`);
    test.info().annotations.push({ type: 'created coupon', description: `${couponId} ${coupon.code}` });
    const row = await coupons.listedCoupon(couponId);
    expect(row.Coupon).toBe(coupon.code);
    expect(row['Coupon Type']).toBe('Percentage');
  });

  test('its details page shows what was saved', async ({ page }) => {
    const details = new CouponDetailsPage(page);

    const saved = await details.open(couponId);

    expect(saved).toMatchObject({
      code: coupon.code,
      discountType: 'Percentage',
      discountValue: coupon.discountValue,
      numOfUsages: coupon.numOfUsages,
      numOfUsagesPerUser: coupon.numOfUsagesPerUser,
      minRentPrice: coupon.minRentPrice,
    });
    expect(await details.detail('Type')).toBe('Percentage');
    expect(await details.detail('No. of total usage')).toBe(String(coupon.numOfUsages));
    // Nothing limits it, so every badge reads All.
    expect(await details.chips('City')).toEqual(['All']);
    expect(await details.chips('Ally')).toEqual(['All']);
  });

  test('its timeline holds the create', async ({ page }) => {
    const coupons = new CouponsPage(page);
    await coupons.open();
    await coupons.filters.open();
    await coupons.filters.code.fill(coupon.code);
    await coupons.search();

    const audits = await coupons.openTimeline(couponId);

    expect(audits.at(-1)).toMatchObject({ action: 'create', newData: { code: coupon.code } });
  });

  test('edits the discount and the usage per customer', async ({ page }) => {
    const form = new CouponFormPage(page);
    const before = await form.openEdit(couponId);
    await expect(form.saveButton).toBeDisabled();

    await form.discountValue.fill(String(coupon.edited.discountValue));
    await form.numOfUsagesPerUser.fill(String(coupon.edited.numOfUsagesPerUser));
    const { sent } = await form.save('UpdateCoupon');

    expect(sent).toMatchObject({
      couponId,
      code: coupon.code,
      discountValue: coupon.edited.discountValue,
      numOfUsagesPerUser: coupon.edited.numOfUsagesPerUser,
    });
    const details = new CouponDetailsPage(page);
    const saved = await details.open(couponId);
    // UpdateCoupon leaves the dates out of what it sends, so an edit must at
    // least not lose them.
    expect(sent).not.toHaveProperty('expireAt');
    expect(saved.startAt).toBe(before.startAt);
    expect(saved.expireAt).toBe(before.expireAt);
    expect(saved.discountValue).toBe(coupon.edited.discountValue);
    expect(saved.numOfUsagesPerUser).toBe(coupon.edited.numOfUsagesPerUser);
    expect(await details.detail('No. of usage per user')).toBe(String(coupon.edited.numOfUsagesPerUser));
  });

  test('the timeline names the changed columns', async ({ page }) => {
    const coupons = new CouponsPage(page);
    await coupons.open();
    await coupons.filters.open();
    await coupons.filters.code.fill(coupon.code);
    await coupons.search();

    const audits = await coupons.openTimeline(couponId);

    expect(audits[0]).toMatchObject({
      action: 'update',
      oldData: { discount_value: expect.anything() },
      newData: { discount_value: expect.anything() },
    });
  });

  test('deactivates it', async ({ page }) => {
    const coupons = new CouponsPage(page);
    await coupons.open();
    await coupons.filters.open();
    await coupons.filters.code.fill(coupon.code);
    await coupons.search();

    const { operation, sent } = await coupons.deactivate(couponId);

    console.log(`Deactivated coupon ${couponId} with ${operation} ${JSON.stringify(sent)}`);
    await coupons.open();
    await coupons.filters.open();
    await coupons.filters.code.fill(coupon.code);
    const { coupons: found } = await coupons.search();
    expect(found[0].isActive, 'the coupon is off after the switch').toBe(false);
    await expect(coupons.activeSwitch(couponId)).not.toBeChecked();
  });
});
