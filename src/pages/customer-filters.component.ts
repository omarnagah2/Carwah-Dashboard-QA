import type { Locator, Page } from '@playwright/test';
import { FilterPanel } from './filter-panel.component';

/**
 * The customers list's filter panel: Customer Name, Email Address, National
 * ID, the Type / Customer Status / Status / Agency Name dropdowns and the
 * mobile.
 */
export class CustomerFilters extends FilterPanel {
  readonly customerName: Locator;
  readonly email: Locator;
  readonly nationalId: Locator;

  constructor(page: Page) {
    super(page);
    this.customerName = page.locator('#customerName');
    this.email = page.locator('#email');
    this.nationalId = page.locator('#nid');
  }

  protected get firstField(): Locator {
    return this.customerName;
  }
}
