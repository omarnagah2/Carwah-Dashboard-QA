import type { Locator, Page } from '@playwright/test';
import { FilterPanel } from './filter-panel.component';

/**
 * The partners list's filter panel: Email Address, Manger Name (sic), the
 * Ally Name / Class / Status dropdowns and the mobile.
 */
export class CompanyFilters extends FilterPanel {
  readonly email: Locator;
  readonly managerName: Locator;

  constructor(page: Page) {
    super(page);
    this.email = page.locator('#email');
    this.managerName = page.locator('#managerName');
  }

  protected get firstField(): Locator {
    return this.email;
  }
}
