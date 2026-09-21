import { expect, type Locator, type Page } from '@playwright/test';
import { BranchFilters } from './branch-filters.component';
import { ListPage } from './list.page';

/** The branches list at /cw/dashboard/branches. */
export class BranchesPage extends ListPage {
  readonly filters = new BranchFilters(this.page);
  readonly createButton = this.byRole('button', { name: 'Create New Branch' });
  readonly carsDialog = this.byRole('dialog').filter({ hasText: 'Listing Cars' });
  readonly timelineDialog = this.byRole('dialog').filter({ hasText: 'Branch TimeLine' });
  readonly deleteDialog = this.byRole('dialog').filter({ hasText: 'you want to delete this branch' });

  constructor(page: Page) {
    super(page, 'BranchID', 'Branches');
  }

  /**
   * The page fills its Ally Name and branches dropdowns with `Branches`
   * queries too; only the list's own carries a page. Choosing the Status
   * "deleted" also fires one malformed query (`isDeleted: "isDeleted"`, a
   * 400) before the right one — a known issue — so that one is ignored here
   * and left to its own spec.
   */
  protected listQueryMatches(variables: Record<string, unknown>): boolean {
    return 'page' in variables && variables.isDeleted !== 'isDeleted';
  }

  async open(): Promise<{ branches: ListedBranch[]; total: number }> {
    const response = await this.openAt('/cw/dashboard/branches');
    await expect(this.rows.first()).toBeVisible();
    return branchesIn(await response.json());
  }

  async search(): Promise<{ query: Record<string, unknown>; branches: ListedBranch[]; total: number }> {
    const response = await this.reloadingList(() => this.filters.searchButton.click());
    return { query: response.request().postDataJSON().variables, ...branchesIn(await response.json()) };
  }

  /** Clear sends no query; the page shows the unfiltered list it already holds. */
  async clearFilters(): Promise<void> {
    await this.filters.clearButton.click();
    await expect(this.page).toHaveURL(/\/cw\/dashboard\/branches$/);
  }

  async listedBranch(branchId: string): Promise<Record<string, string>> {
    return this.row('BranchID', branchId);
  }

  async openBranch(branchId: string): Promise<void> {
    await this.table.getByRole('link', { name: branchId, exact: true }).click();
    await expect(this.page).toHaveURL(new RegExp(`/cw/dashboard/branches/${branchId}$`));
  }

  /** A row's Actions: Edit, delete (never confirmed) and Timeline. */
  action(branchId: string, title: 'Edit' | 'delete' | 'Timeline'): Locator {
    return this.rowOf(branchId).getByTitle(title, { exact: true });
  }

  /** The row's active switch — a real change, so specs only read it. */
  activeSwitch(branchId: string): Locator {
    return this.rowOf(branchId).locator(`input[type="checkbox"][name="${branchId}"]`);
  }

  /**
   * **Show Cars** opens a "Listing Cars" dialog of the branch's cars, filled
   * by `AllyCars`. Returns what it answered.
   */
  async showCars(branchId: string): Promise<{ cars: ListedCar[]; total: number }> {
    const cars = this.page.waitForResponse((r) => r.request().postDataJSON()?.operationName === 'AllyCars', { timeout: 30_000 });
    await this.rowOf(branchId).getByRole('button', { name: 'Show Cars' }).click();
    const response = await cars;
    await expect(this.carsDialog).toBeVisible();
    const result = (await response.json()).data?.allyCars;
    return { cars: result?.collection ?? [], total: result?.metadata?.totalCount ?? 0 };
  }

  /**
   * Answers the delete question with Cancel. SweetAlert only fades a closed
   * alert out (opacity 0) and keeps it in the page, which Playwright still
   * counts as visible — so "closed" is its overlay losing
   * `swal-overlay--show-modal`, not the dialog disappearing.
   */
  async cancelDelete(): Promise<void> {
    await this.deleteDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(this.page.locator('.swal-overlay--show-modal')).toHaveCount(0);
  }

  async closeCars(): Promise<void> {
    await this.carsDialog.getByRole('button', { name: 'Close' }).last().click();
    await expect(this.carsDialog).toBeHidden();
  }

  /** Opens a branch's Timeline and returns the audit entries behind it. */
  async openTimeline(branchId: string): Promise<BranchAudit[]> {
    const audits = this.page.waitForResponse(
      (r) => (r.request().postDataJSON()?.operationName ?? '').includes('Audit'),
      { timeout: 30_000 },
    );
    await this.action(branchId, 'Timeline').click();
    const response = await audits;
    await expect(this.timelineDialog).toBeVisible();
    const [entries] = Object.values((await response.json()).data ?? {}) as BranchAudit[][];
    return entries ?? [];
  }

  private rowOf(branchId: string): Locator {
    return this.rows.filter({ has: this.page.getByRole('link', { name: branchId, exact: true }) });
  }
}

/** The fields of a `Branches` row that specs check. */
export interface ListedBranch {
  id: string;
  name: string;
  enName: string;
  arName: string;
  isActive: boolean;
  deletedAt: string | null;
  officeNumber: string;
  area: { id: string; enName: string };
  allyCompany: { id: string; name: string; email: string };
}

/** The fields of an `AllyCars` row the cars dialog shows. */
export interface ListedCar {
  id: string;
  allyName: string;
  availabilityStatus: boolean;
  dailyPrice: number;
  branch: { id: string; enName: string };
}

export interface BranchAudit {
  action: string;
  userName: string;
  oldData: Record<string, unknown>;
  newData: Record<string, unknown>;
}

function branchesIn(body: {
  data?: { branches?: { collection?: ListedBranch[]; metadata?: { totalCount?: number } } };
}): { branches: ListedBranch[]; total: number } {
  const result = body.data?.branches;
  return { branches: result?.collection ?? [], total: result?.metadata?.totalCount ?? 0 };
}
