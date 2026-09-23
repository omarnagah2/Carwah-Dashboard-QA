import { expect, test } from '../../src/fixtures/test';
import { testData } from '../../src/config/test-data';
import { CouponDetailsPage } from '../../src/pages/coupon-details.page';
import { CouponStatisticsPage } from '../../src/pages/coupon-statistics.page';
import { CouponsPage } from '../../src/pages/coupons.page';

const { knownCoupon, usedCoupon } = testData.coupons;

/**
 * Read-only. Coupons belong to real allies and bookings are priced with them,
 * so nothing here saves a form or confirms the row switch — the switch is
 * flipped only far enough to read its question, which is answered No.
 */
test.describe('coupons list', () => {
  let coupons: CouponsPage;

  test.beforeEach(async ({ page }) => {
    coupons = new CouponsPage(page);
  });

  test('lists every coupon', async () => {
    const { coupons: listed, total } = await coupons.open();

    expect(total).toBeGreaterThan(300);
    expect(listed.length).toBe(10);
    expect(await coupons.total()).toBe(total);
    expect(await coupons.column('Coupon')).toEqual(listed.map((coupon) => coupon.code));
  });

  test('a row carries the coupon and its actions', async () => {
    await coupons.open();

    const row = await coupons.listedCoupon(knownCoupon.id);
    expect(row.Coupon).toBe(knownCoupon.code);
    expect(row['Coupon Type']).toBe(knownCoupon.type);
    expect(row['Start date']).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    for (const action of ['Edit', 'Statistics', 'Timeline'] as const) {
      await expect(coupons.action(knownCoupon.id, action)).toBeVisible();
    }
    await expect(coupons.action(knownCoupon.id, 'Edit')).toHaveAttribute('href', `/cw/dashboard/coupons/${knownCoupon.id}/edit`);
  });

  test('pages and page sizes keep the list', async () => {
    const { coupons: first } = await coupons.open();

    const second = await coupons.goToPage(2);
    const onPage2 = (await second.json()).data.coupons;
    expect(second.request().postDataJSON().variables).toMatchObject({ page: 2, limit: 10 });
    expect(onPage2.collection.map((c: { id: string }) => c.id)).not.toEqual(first.map((c) => c.id));

    const resized = await coupons.setPageSize(20);
    expect(resized.request().postDataJSON().variables).toMatchObject({ limit: 20 });
    await expect(coupons.rows).toHaveCount(20);
  });

  test('the switch asks before deactivating a coupon', async () => {
    const { coupons: listed } = await coupons.open();
    const active = listed.find((coupon) => coupon.isActive)!;

    await expect(coupons.activeSwitch(active.id)).toBeChecked();
    await coupons.activeSwitch(active.id).click();

    await expect(coupons.deactivateDialog).toBeVisible();
    await coupons.deactivateDialog.getByRole('button', { name: 'No', exact: true }).click();
    await expect(coupons.deactivateDialog).toBeHidden();
    await expect(coupons.activeSwitch(active.id)).toBeChecked();
  });

  test('the timeline lists what changed', async () => {
    await coupons.open();

    const audits = await coupons.openTimeline(knownCoupon.id);

    expect(audits.length).toBeGreaterThan(0);
    await expect(coupons.timelineDialog).toContainText(`Coupon ID :${knownCoupon.id}`);
    // Audits name the database's own columns, and the oldest entry is the
    // `create` that carries the code.
    expect(audits.at(-1)).toMatchObject({ action: 'create', newData: { code: knownCoupon.code } });
  });

  test('the details page shows what the API answered', async ({ page }) => {
    const details = new CouponDetailsPage(page);

    const coupon = await details.open(knownCoupon.id);

    expect(coupon.code).toBe(knownCoupon.code);
    expect(await details.detail('Coupon Code')).toBe(knownCoupon.code);
    expect(await details.detail('Type')).toBe(knownCoupon.type);
    expect(await details.detail('No. of total usage')).toBe(String(coupon.numOfUsages));
    expect(await details.detail('No. of usage per user')).toBe(String(coupon.numOfUsagesPerUser));
    expect(await details.detail('Start date')).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
    expect(await details.chips('City')).toEqual(knownCoupon.cities);
  });

  test('statistics count the bookings that used the coupon', async ({ page }) => {
    const statistics = new CouponStatisticsPage(page);

    const { statistics: counted, bookings, total } = await statistics.open(usedCoupon.id);

    expect(counted).toMatchObject({ noOfUsage: usedCoupon.usages, noOfUsers: usedCoupon.users, couponSales: usedCoupon.sales });
    expect(await statistics.counter('No. of total usages')).toBe(counted!.noOfUsage);
    expect(await statistics.counter('No. of users')).toBe(counted!.noOfUsers);
    expect(await statistics.counter('Coupon sales')).toBe(counted!.couponSales);
    expect(total).toBe(bookings.length);
    await expect(statistics.table.locator('tbody tr')).toHaveCount(total);
    expect(await statistics.table.locator('tbody tr').first().innerText()).toContain(bookings[0].bookingNo);
  });

  test('a coupon nobody used shows zeroes and no bookings', async ({ page }) => {
    const statistics = new CouponStatisticsPage(page);

    const { statistics: counted, total } = await statistics.open(knownCoupon.id);

    expect(counted).toBeNull();
    expect(total).toBe(0);
    await expect(statistics.noRecords).toBeVisible();
    expect(await statistics.counter('No. of total usages')).toBe(0);
  });
});
