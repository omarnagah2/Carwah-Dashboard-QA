import { expect, test } from '../../src/fixtures/test';
import { testData } from '../../src/config/test-data';
import { CouponDetailsPage } from '../../src/pages/coupon-details.page';
import { CouponsPage } from '../../src/pages/coupons.page';

const { knownCoupon, allyCoupon, city } = testData.coupons;

/**
 * Read-only. The panel holds three filters — Coupon Code, Ally Name and City —
 * and each is checked twice: the query carries it, and what comes back
 * satisfies it.
 */
test.describe('coupons filters', () => {
  let coupons: CouponsPage;
  let unfilteredTotal: number;

  test.beforeEach(async ({ page }) => {
    coupons = new CouponsPage(page);
    ({ total: unfilteredTotal } = await coupons.open());
    await coupons.filters.open();
  });

  test('by coupon code', async ({ page }) => {
    await coupons.filters.code.fill(knownCoupon.code);

    const { query, coupons: found, total } = await coupons.search();

    expect(query.code).toBe(knownCoupon.code);
    expect(total).toBeLessThan(unfilteredTotal);
    expect(found.map((coupon) => coupon.id)).toContain(knownCoupon.id);
    for (const coupon of found) {
      expect(coupon.code, `coupon ${coupon.id}`).toContain(knownCoupon.code);
    }
    // The page writes the filter into the URL as JSON, percent-encoded.
    expect(decodeURIComponent(page.url())).toContain(`?{"code":"${knownCoupon.code}"}`);
  });

  test('the code search matches part of a code', async () => {
    await coupons.filters.code.fill('free');

    const { coupons: found, total } = await coupons.search();

    expect(total).toBeGreaterThan(1);
    for (const coupon of found) {
      expect(coupon.code.toLowerCase(), `coupon ${coupon.id}`).toContain('free');
    }
  });

  test('a code nobody has empties the list', async () => {
    await coupons.filters.code.fill('no-such-coupon-zzz');

    const { total } = await coupons.search();

    expect(total).toBe(0);
    await expect(coupons.noRecords).toBeVisible();
  });

  test('by ally name', async ({ page }) => {
    await coupons.filters.choose('Ally Name', allyCoupon.ally);

    const { query, coupons: found, total } = await coupons.search();

    expect(query.allyCompanyIds).toEqual([allyCoupon.allyId]);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(unfilteredTotal);
    expect(found.map((coupon) => coupon.id)).toContain(allyCoupon.couponId);

    // The row carries no ally, so the first result's own page is checked.
    const details = new CouponDetailsPage(page);
    const coupon = await details.open(found[0].id);
    expect((coupon.allyCompanies ?? []).map((ally) => ally.id)).toContain(allyCoupon.allyId);
  });

  test('by city', async ({ page }) => {
    await coupons.filters.choose('City', city);

    const { query, coupons: found, total } = await coupons.search();

    expect(query.cityIds).toEqual(['1']);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(unfilteredTotal);
    // The query says `cityIds`, the URL `cityId`.
    expect(decodeURIComponent(page.url())).toContain('?{"cityId":["1"]}');

    // A coupon with no city of its own is offered in every city ("All"), so
    // each result either names the city or names none.
    const details = new CouponDetailsPage(page);
    for (const listed of found.slice(0, 3)) {
      const coupon = await details.open(listed.id);
      const cities = (coupon.areas ?? []).map((area) => area.name);
      expect(cities.length === 0 || cities.includes(city), `coupon ${listed.id} is offered in ${cities.join(', ') || 'every city'}`).toBe(true);
    }
  });

  test('clear brings back the unfiltered list', async ({ page }) => {
    await coupons.filters.code.fill(knownCoupon.code);
    await coupons.search();
    expect(await coupons.total()).toBeLessThan(unfilteredTotal);

    const cleared = await coupons.reloadingClear();

    expect(cleared.request().postDataJSON().variables).toEqual({ page: 1, limit: 10 });
    await expect(coupons.totalResults).toHaveText(`Total Results: ${unfilteredTotal}`);
    await expect(page).toHaveURL(/\/cw\/dashboard\/coupons$/);
  });
});
