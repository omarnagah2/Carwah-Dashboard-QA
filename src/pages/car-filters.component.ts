import type { Locator, Page } from '@playwright/test';
import { FilterPanel } from './filter-panel.component';

/**
 * The cars list's filter panel: Plate No., Acriss Code, Rent/Day, and twelve
 * react-selects — Ally Name, branches, Insurance Type, Make, Models, Vehicle
 * Type, City, Rent Type, Transmission, Car Availability Status, Year, KM Type.
 */
export class CarFilters extends FilterPanel {
  readonly plateNo: Locator;
  readonly acrissCode: Locator;
  readonly rentPerDay: Locator;

  constructor(page: Page) {
    super(page);
    this.plateNo = page.locator('#plateNo');
    this.acrissCode = page.locator('#acrissCode');
    this.rentPerDay = page.getByPlaceholder('Rent/Day');
  }

  protected get firstField(): Locator {
    return this.plateNo;
  }
}
