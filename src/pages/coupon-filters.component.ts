import type { Locator, Page } from '@playwright/test';
import { FilterPanel } from './filter-panel.component';

/**
 * The coupons list's filter panel: the Coupon Code field and two
 * react-selects — Ally Name and City.
 */
export class CouponFilters extends FilterPanel {
  readonly code: Locator;

  constructor(page: Page) {
    super(page);
    this.code = page.locator('#code');
  }

  protected get firstField(): Locator {
    return this.code;
  }
}
