import { expect, type Locator, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { CarFilters } from './car-filters.component';
import { ListPage } from './list.page';

/** The cars list ("Listing Cars") at /cw/dashboard/cars. */
export class CarsPage extends ListPage {
  readonly filters = new CarFilters(this.page);
  readonly createButton = this.byRole('button', { name: 'Create New Car' });
  readonly fleetManagementButton = this.byRole('button', { name: 'Fleet Management' });
  /** The bulk-actions button above the list; the table has an "Actions" header button too. */
  readonly bulkActionsButton = this.byRole('button', { name: 'Actions', exact: true }).filter({
    hasNot: this.page.locator('xpath=ancestor::table'),
  });
  readonly timelineDialog = this.byRole('dialog').filter({ hasText: 'Car TimeLine' });

  constructor(page: Page) {
    super(page, 'Acriss Code', 'AllyCars');
  }

  async open(): Promise<{ cars: ListedCar[]; total: number }> {
    const response = await this.openAt('/cw/dashboard/cars');
    await expect(this.rows.first()).toBeVisible();
    return carsIn(await response.json());
  }

  async search(): Promise<{ query: Record<string, unknown>; cars: ListedCar[]; total: number }> {
    const response = await this.reloadingList(() => this.filters.searchButton.click());
    return { query: response.request().postDataJSON().variables, ...carsIn(await response.json()) };
  }

  /**
   * Presses Search and returns every `AllyCars` query it sent within a few
   * seconds — none at all for the filters that do nothing (known issues).
   */
  async searchSends(): Promise<Record<string, unknown>[]> {
    const sent: Record<string, unknown>[] = [];
    const listen = (request: { url(): string; postDataJSON(): { operationName?: string; variables?: Record<string, unknown> } | null }) => {
      const body = request.url().includes('/graphql') ? request.postDataJSON() : null;
      if (body?.operationName === this.listQuery) {
        sent.push(body.variables ?? {});
      }
    };
    this.page.on('request', listen);
    await this.filters.searchButton.click();
    await this.page.waitForTimeout(5_000);
    this.page.off('request', listen);
    return sent;
  }

  /**
   * One listed car as header → cell text. The list has no id column; a car's
   * row is the one linking to its page. The first header is the bulk-select
   * checkbox, named "".
   */
  async listedCar(carId: string): Promise<Record<string, string>> {
    const headers = (await this.table.locator('thead th').allTextContents()).map((text) => text.trim());
    const cells = await this.rowOf(carId).evaluate((row) =>
      [...(row as HTMLTableRowElement).cells].map((cell) => cell.innerText.replace(/\s+/g, ' ').trim()),
    );
    return Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? '']));
  }

  async openCar(carId: string): Promise<void> {
    await this.rowOf(carId).locator(`a[href="/cw/dashboard/cars/${carId}"]`).first().click();
    await expect(this.page).toHaveURL(new RegExp(`/cw/dashboard/cars/${carId}$`));
  }

  /** A row's Actions: Edit and Timeline. */
  action(carId: string, title: 'Edit' | 'Timeline'): Locator {
    return this.rowOf(carId).getByTitle(title, { exact: true });
  }

  /** The row's availability switch — a real change, so specs only read it. */
  activeSwitch(carId: string): Locator {
    return this.rowOf(carId).locator(`input[type="checkbox"][name="${carId}"]`);
  }

  /**
   * Flips a car's availability switch: `ActivateCar { carId,
   * availabilityStatus }`, no confirmation. Only used to put back a car a
   * spec's own booking switched off (see the add-booking scenarios); the row
   * may drop out of a filtered list afterwards, so the answer is what is
   * checked.
   */
  async setAvailable(carId: string, available: boolean): Promise<void> {
    const toggle = this.activeSwitch(carId);
    await expect(toggle).toBeChecked({ checked: !available });
    const changed = this.page.waitForResponse((r) => isOperation(r, 'ActivateCar'), { timeout: 30_000 });
    await toggle.click();
    const response = await changed;
    expect(response.request().postDataJSON().variables).toEqual({ availabilityStatus: available, carId });
    const body = await response.json();
    expect(body.data?.activateCar?.errors ?? [], `ActivateCar answered ${JSON.stringify(body)}`).toEqual([]);
    expect(body.data.activateCar.status).toBe('success');
  }

  /** Opens the bulk Actions menu and returns its items; picks none of them. */
  async bulkActions(): Promise<string[]> {
    await this.bulkActionsButton.click();
    const items = this.byRole('menuitem');
    await expect(items.first()).toBeVisible();
    const names = (await items.allInnerTexts()).map((text) => text.trim());
    await this.page.keyboard.press('Escape');
    await expect(items).toHaveCount(0);
    return names;
  }

  /** Opens a car's Timeline and returns what `CarAudits` answered. */
  async openTimeline(carId: string): Promise<CarAudit[]> {
    const audits = this.page.waitForResponse((r) => isOperation(r, 'CarAudits'), { timeout: 30_000 });
    await this.action(carId, 'Timeline').click();
    const response = await audits;
    await expect(this.timelineDialog).toBeVisible();
    const [entries] = Object.values((await response.json()).data ?? {}) as CarAudit[][];
    return entries ?? [];
  }

  private rowOf(carId: string): Locator {
    return this.rows.filter({ has: this.page.locator(`a[href="/cw/dashboard/cars/${carId}"]`) });
  }
}

/** The fields of an `AllyCars` row that specs check. */
export interface ListedCar {
  id: string;
  allyName: string;
  availabilityStatus: boolean;
  dailyPrice: number;
  weeklyPrice: number;
  monthlyPrice: number;
  year: number;
  transmissionName: string;
  carsCount: number;
  make: { enName: string };
  carModel: { enName: string; acrissCode: string };
  branch: { id: string; enName: string; allyCompany: { id: string; enName: string }; area: { id: string; name: string } };
}

export interface CarAudit {
  action: string;
  userName: string;
  oldData: Record<string, unknown>;
  newData: Record<string, unknown>;
}

function carsIn(body: {
  data?: { allyCars?: { collection?: ListedCar[]; metadata?: { totalCount?: number } } };
}): { cars: ListedCar[]; total: number } {
  const result = body.data?.allyCars;
  return { cars: result?.collection ?? [], total: result?.metadata?.totalCount ?? 0 };
}
