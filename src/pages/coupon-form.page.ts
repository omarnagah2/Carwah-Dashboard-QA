import { expect, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { escapeRegExp } from '../utils/text';
import { BasePage } from './base.page';
import { pickCalendarDate } from './date-time-picker.component';

export type CouponType = 'Percentage' | 'Fixed value' | 'Free delivery' | 'Free handover' | 'Freedays';

/** What a spec fills into the form. Everything else is left at its default. */
export interface NewCoupon {
  code: string;
  type: CouponType;
  discountValue: number;
  startDate: Date;
  endDate: Date;
  numOfUsages: number;
  numOfUsagesPerUser: number;
  minRentPrice: number;
}

/**
 * The coupon form, shared by "Create Coupon" (/coupons/add) and "Edit Coupon"
 * (/coupons/<id>/edit). **Save is disabled until the form is filled**, and the
 * Type decides whether a Discount value field is there at all — it appears
 * only for Percentage and Fixed value.
 */
export class CouponFormPage extends BasePage {
  readonly code = this.page.locator('#code');
  readonly discountValue = this.page.locator('#discountValue');
  readonly maxLimitValue = this.page.locator('#maxLimitValue');
  readonly numOfUsages = this.page.locator('#numOfUsages');
  readonly numOfUsagesPerUser = this.page.locator('#numOfUsagesPerUser');
  readonly minRentPrice = this.page.locator('#minRentPrice');
  readonly startDate = this.page.locator('input[name="start"]');
  readonly endDate = this.page.locator('input[name="enddate"]');
  readonly monthly = this.page.locator('input[name="is_monthly"]');
  readonly newCustomers = this.page.locator('input[name="New Customers"]');
  readonly saveButton = this.byRole('button', { name: 'Save' });
  readonly cancelButton = this.byRole('button', { name: 'Cancel' });
  private readonly dropdowns = this.page.locator('div.dropdown-select');

  constructor(page: Page) {
    super(page);
  }

  async openAdd(): Promise<void> {
    await this.page.goto('/cw/dashboard/coupons/add', { waitUntil: 'domcontentloaded' });
    await expect(this.byRole('heading', { name: 'Create Coupon' }).first()).toBeVisible({ timeout: 30_000 });
    await expect(this.code).toBeVisible();
  }

  /** Opens a coupon's edit page and returns the `CouponDetails` it loads. */
  async openEdit(couponId: string): Promise<Record<string, unknown>> {
    const loaded = this.page.waitForResponse((r) => isOperation(r, 'CouponDetails'), { timeout: 30_000 });
    await this.page.goto(`/cw/dashboard/coupons/${couponId}/edit`, { waitUntil: 'domcontentloaded' });
    const [coupon] = Object.values((await (await loaded).json()).data ?? {}) as Record<string, unknown>[];
    await expect(this.code).toHaveValue(String(coupon.code), { timeout: 30_000 });
    await this.page.waitForLoadState('networkidle');
    return coupon;
  }

  /**
   * One of the form's react-selects, named by the placeholder it shows while
   * nothing is chosen (Ally Name, Agencies, Ally's branches, Car Version,
   * City, Type, Payment Method, paymentbrand).
   */
  async choose(placeholder: string, option: string): Promise<void> {
    const placeholders = (await this.dropdowns.allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());
    const index = placeholders.indexOf(placeholder);
    expect(index, `dropdown "${placeholder}" among ${placeholders.join(' | ')}`).toBeGreaterThanOrEqual(0);
    const dropdown = this.dropdowns.nth(index);
    await dropdown.locator('input').focus();
    await this.page.keyboard.press('ArrowDown');
    await this.page
      .locator('[id*="-option-"]')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(option)}\\s*$`) })
      .first()
      .click();
    await this.page.keyboard.press('Escape');
    await expect(dropdown).toContainText(option);
  }

  /** Fills every field a coupon needs; the Type is chosen first so its value field is there. */
  async fill(coupon: NewCoupon): Promise<void> {
    await this.code.fill(coupon.code);
    await this.choose('Type', coupon.type);
    await expect(this.discountValue).toBeVisible();
    await this.discountValue.fill(String(coupon.discountValue));
    await pickCalendarDate(this.page, this.startDate, coupon.startDate);
    await pickCalendarDate(this.page, this.endDate, coupon.endDate);
    await this.numOfUsages.fill(String(coupon.numOfUsages));
    await this.numOfUsagesPerUser.fill(String(coupon.numOfUsagesPerUser));
    await this.minRentPrice.fill(String(coupon.minRentPrice));
  }

  /**
   * Presses Save and returns the mutation it sent, failing with what the API
   * said when it refuses. The answer is read **through a route**: saving
   * leaves the page at once, and a body read after that navigation is gone
   * ("No resource with given identifier found").
   */
  async save(operation: 'CreateCoupons' | 'UpdateCoupon'): Promise<{ sent: Record<string, unknown>; answer: Record<string, unknown> }> {
    let sent: Record<string, unknown> | undefined;
    let body: { data?: Record<string, unknown>; errors?: unknown[] } | undefined;
    await this.page.route('**/graphql', async (route) => {
      const request = route.request().postDataJSON();
      if (request?.operationName !== operation) {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      body = await response.json();
      sent = request.variables;
      await route.fulfill({ response, json: body });
    });
    try {
      await this.saveButton.click();
      await expect
        .poll(() => body, { message: `${operation} was never sent`, timeout: 30_000 })
        .toBeDefined();
    } finally {
      await this.page.unroute('**/graphql');
    }
    const [answer] = Object.values(body!.data ?? {}) as Record<string, unknown>[];
    expect(body!.errors ?? answer?.errors ?? [], `${operation} answered ${JSON.stringify(body).slice(0, 400)}`).toEqual([]);
    expect(answer?.status).toBe('success');
    return { sent: sent!, answer };
  }

}
