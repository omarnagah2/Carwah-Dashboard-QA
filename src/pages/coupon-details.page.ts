import { expect, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { BasePage } from './base.page';
import { detailValue, readDetail } from './detail-list.component';

/**
 * A coupon's page, /cw/dashboard/coupons/<id> ("Coupon Details", from
 * `CouponDetails`). Six facts are the usual `li.list_item_info` items; City,
 * Ally and Agencies sit in the same list but hold badges instead
 * (`chips`).
 */
export class CouponDetailsPage extends BasePage {
  readonly heading = this.byRole('heading', { name: 'Coupon Details' }).first();
  readonly editButton = this.byRole('button', { name: 'Edit' });
  readonly backButton = this.byRole('button', { name: 'Back' });

  constructor(page: Page) {
    super(page);
  }

  /** Opens the page and returns the `CouponDetails` answer it is built from. */
  async open(couponId: string): Promise<CouponProfile> {
    const loaded = this.page.waitForResponse((r) => isOperation(r, 'CouponDetails'), { timeout: 30_000 });
    await this.page.goto(`/cw/dashboard/coupons/${couponId}`, { waitUntil: 'domcontentloaded' });
    const [coupon] = Object.values((await (await loaded).json()).data ?? {}) as CouponProfile[];
    await expect(this.heading).toBeVisible();
    await expect(detailValue(this.page, 'Coupon Code')).not.toBeEmpty({ timeout: 30_000 });
    return coupon;
  }

  async detail(label: string): Promise<string> {
    return readDetail(this.page, label);
  }

  /** The badges beside City, Ally or Agencies — `["Riyadh", "Jeddah"]`, or `["All"]`. */
  async chips(label: 'City' | 'Ally' | 'Agencies'): Promise<string[]> {
    const item = this.page
      .locator('li.MuiListItem-root')
      .filter({ hasNot: this.page.locator('span.text-align-localized') })
      .filter({ has: this.page.getByText(label, { exact: true }) })
      .first();
    return (await item.locator('span.badge').allInnerTexts()).map((text) => text.trim());
  }
}

/** The fields of `CouponDetails` the specs check. */
export interface CouponProfile {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  numOfUsages: number;
  numOfUsagesPerUser: number;
  maxLimitValue: number | null;
  minRentPrice: number | null;
  minRentDays: number | null;
  numOfDays: number | null;
  paymentMethod: string | null;
  paymentBrands: string[] | null;
  forNewCustomers: boolean;
  isMonthly: boolean;
  startAt: string;
  expireAt: string | null;
  areas: { id: string; name?: string }[] | null;
  allyCompanies: { id: string; enName: string }[] | null;
  agencyIds: string[] | null;
  branches: { id: string }[] | null;
  carVersions: { id: string }[] | null;
}
