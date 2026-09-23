import { expect, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { BasePage } from './base.page';

/**
 * A coupon's Statistics page, /cw/dashboard/coupons/<id>/statistics: three
 * counters from `CouponStatistics` and the bookings that used the coupon,
 * fetched as `GetBookingsQuery { couponId }`. A coupon nobody has used
 * answers `couponStatistics: null`, and the page then shows three zeroes and
 * "No records found!".
 */
export class CouponStatisticsPage extends BasePage {
  readonly heading = this.byRole('heading', { name: 'Statistics' }).first();
  readonly noRecords = this.page.getByText('No records found!');
  readonly table = this.page.getByRole('table').filter({ has: this.page.getByRole('columnheader', { name: 'Discount Value' }) });

  constructor(page: Page) {
    super(page);
  }

  /** Opens the page and returns both answers it is built from. */
  async open(couponId: string): Promise<{ statistics: CouponStatistics | null; bookings: CouponBooking[]; total: number }> {
    const counted = this.page.waitForResponse((r) => isOperation(r, 'CouponStatistics'), { timeout: 30_000 });
    const listed = this.page.waitForResponse((r) => isOperation(r, 'GetBookingsQuery'), { timeout: 30_000 });
    await this.page.goto(`/cw/dashboard/coupons/${couponId}/statistics`, { waitUntil: 'domcontentloaded' });
    const statistics = ((await (await counted).json()).data?.couponStatistics ?? null) as CouponStatistics | null;
    const [rentals] = Object.values((await (await listed).json()).data ?? {}) as {
      collection?: CouponBooking[];
      metadata?: { totalCount?: number };
    }[];
    await expect(this.heading).toBeVisible();
    return { statistics, bookings: rentals?.collection ?? [], total: rentals?.metadata?.totalCount ?? 0 };
  }

  /** One of the three counters above the table. */
  async counter(label: 'No. of total usages' | 'No. of users' | 'Coupon sales'): Promise<number> {
    const text = (await this.page.locator('body').innerText()).replace(/\s+/g, ' ');
    const match = text.match(new RegExp(`${label} (-?\\d+(?:\\.\\d+)?)`));
    expect(match, `"${label}" among ${text.slice(0, 300)}`).not.toBeNull();
    return Number(match![1]);
  }
}

export interface CouponStatistics {
  noOfUsage: number;
  noOfUsers: number;
  couponSales: number;
}

export interface CouponBooking {
  id: string;
  bookingNo: string;
  customerName: string;
  couponDiscount: number;
  status: string;
}
