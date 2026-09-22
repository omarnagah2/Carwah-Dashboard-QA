import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { CouponFilters } from './coupon-filters.component';
import { ListPage } from './list.page';

/** The coupons list at /cw/dashboard/coupons. */
export class CouponsPage extends ListPage {
  readonly filters = new CouponFilters(this.page);
  readonly createButton = this.byRole('button', { name: 'Create New Coupon' });
  readonly timelineDialog = this.byRole('dialog').filter({ hasText: 'Coupon TimeLine' });
  /** The question the row's switch asks; the specs always answer No. */
  readonly deactivateDialog = this.byRole('dialog').filter({ hasText: 'you want to deactivate this coupon' });

  constructor(page: Page) {
    super(page, 'Coupon Type', 'Coupons');
  }

  async open(): Promise<{ coupons: ListedCoupon[]; total: number }> {
    const response = await this.openAt('/cw/dashboard/coupons');
    await expect(this.rows.first()).toBeVisible();
    return couponsIn(await response.json());
  }

  async search(): Promise<{ query: Record<string, unknown>; coupons: ListedCoupon[]; total: number }> {
    const response = await this.reloadingList(() => this.filters.searchButton.click());
    return { query: response.request().postDataJSON().variables, ...couponsIn(await response.json()) };
  }

  /** Clear asks for the unfiltered list again (as the cars list does). */
  async reloadingClear(): Promise<Response> {
    return this.reloadingList(() => this.filters.clearButton.click());
  }

  /** One listed coupon as header → cell text; its row is the one linking to it. */
  async listedCoupon(couponId: string): Promise<Record<string, string>> {
    const headers = (await this.table.locator('thead th').allTextContents()).map((text) => text.trim());
    const cells = await this.rowOf(couponId).evaluate((row) =>
      [...(row as HTMLTableRowElement).cells].map((cell) => cell.innerText.replace(/\s+/g, ' ').trim()),
    );
    return Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? '']));
  }

  /** A row's Actions: Edit and Statistics are links, Timeline opens a dialog. */
  action(couponId: string, title: 'Edit' | 'Statistics' | 'Timeline'): Locator {
    return this.rowOf(couponId).getByTitle(title, { exact: true });
  }

  /**
   * The row's active switch. Flipping it asks for confirmation, so a spec can
   * open the question and answer No without changing the coupon
   * (`answerDeactivate`).
   */
  activeSwitch(couponId: string): Locator {
    return this.rowOf(couponId).locator(`input[type="checkbox"][name="${couponId}"]`);
  }

  /** Opens a coupon's Timeline and returns what `CouponAudits` answered. */
  async openTimeline(couponId: string): Promise<CouponAudit[]> {
    const audits = this.page.waitForResponse((r) => isOperation(r, 'CouponAudits'), { timeout: 30_000 });
    await this.action(couponId, 'Timeline').click();
    const response = await audits;
    await expect(this.timelineDialog).toBeVisible();
    const [entries] = Object.values((await response.json()).data ?? {}) as CouponAudit[][];
    return entries ?? [];
  }

  async goToCoupon(couponId: string): Promise<void> {
    await this.rowOf(couponId).locator(`a[href="/cw/dashboard/coupons/${couponId}"]`).first().click();
    await expect(this.page).toHaveURL(new RegExp(`/cw/dashboard/coupons/${couponId}$`));
  }

  private rowOf(couponId: string): Locator {
    return this.rows.filter({ has: this.page.locator(`a[href="/cw/dashboard/coupons/${couponId}"]`) });
  }
}

/** A coupon as the list query returns it. */
export interface ListedCoupon {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  isActive: boolean;
  startAt: string;
  expireAt: string | null;
  numOfUsages: number;
  numOfUsagesPerUser: number;
  maxLimitValue: number | null;
  areas: { id?: string }[] | null;
}

export interface CouponAudit {
  action?: string;
  userName?: string;
  oldData: Record<string, unknown>;
  newData: Record<string, unknown>;
}

function couponsIn(body: {
  data?: { coupons?: { collection?: ListedCoupon[]; metadata?: { totalCount?: number } } };
}): { coupons: ListedCoupon[]; total: number } {
  const result = body.data?.coupons;
  return { coupons: result?.collection ?? [], total: result?.metadata?.totalCount ?? 0 };
}
