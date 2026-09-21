import type { Locator, Page } from '@playwright/test';
import { FilterPanel } from './filter-panel.component';

/**
 * The branches list's filter panel — four react-selects and no text fields:
 * Ally Name, branches (the branch itself), City and Status.
 */
export class BranchFilters extends FilterPanel {
  constructor(page: Page) {
    super(page);
  }

  /** The panel has no fields of its own, so its buttons say whether it is open. */
  protected get firstField(): Locator {
    return this.searchButton;
  }
}
