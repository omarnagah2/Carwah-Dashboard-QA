import { expect, type Locator, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { CompanyFilters } from './company-filters.component';
import { ListPage } from './list.page';

/** The partners (ally companies) list at /cw/dashboard/companies. */
export class CompaniesPage extends ListPage {
  readonly filters = new CompanyFilters(this.page);
  readonly createButton = this.byRole('button', { name: 'Create new company' });
  readonly timelineDialog = this.byRole('dialog').filter({ hasText: 'Company TimeLine' });

  constructor(page: Page) {
    // "ID" alone would also match other headers; Manager Name is this list's own.
    super(page, 'Manager Name', 'AllyCompanies');
  }

  /** Returns the partners and total the page loaded with. */
  async open(): Promise<{ companies: ListedCompany[]; total: number }> {
    const response = await this.openAt('/cw/dashboard/companies');
    await expect(this.rows.first()).toBeVisible();
    return companiesIn(await response.json());
  }

  async search(): Promise<{ query: Record<string, unknown>; companies: ListedCompany[]; total: number }> {
    const response = await this.reloadingList(() => this.filters.searchButton.click());
    return { query: response.request().postDataJSON().variables, ...companiesIn(await response.json()) };
  }

  /**
   * Clear sends no query: the page shows the unfiltered list it already
   * holds (Apollo's cached first answer).
   */
  async clearFilters(): Promise<void> {
    await this.filters.clearButton.click();
    await expect(this.filters.email).toHaveValue('');
    await expect(this.page).toHaveURL(/\/cw\/dashboard\/companies$/);
  }

  async listedCompany(companyId: string): Promise<Record<string, string>> {
    return this.row('ID', companyId);
  }

  async openCompany(companyId: string): Promise<void> {
    await this.table.getByRole('link', { name: companyId, exact: true }).click();
    await expect(this.page).toHaveURL(new RegExp(`/cw/dashboard/companies/${companyId}$`));
  }

  /** A row's Actions: Edit and Timeline links. */
  action(companyId: string, title: 'Edit' | 'Timeline'): Locator {
    return this.rowOf(companyId).getByTitle(title, { exact: true });
  }

  /**
   * The row's active switch — a real change on pre-prod, so specs only read
   * it. Its input is named after the company id.
   */
  activeSwitch(companyId: string): Locator {
    return this.rowOf(companyId).locator(`input[type="checkbox"][name="${companyId}"]`);
  }

  /** Opens a partner's Timeline and returns what `AllyCompanyAudits` answered. */
  async openTimeline(companyId: string): Promise<CompanyAudit[]> {
    const audits = this.page.waitForResponse((r) => isOperation(r, 'AllyCompanyAudits'), { timeout: 30_000 });
    await this.action(companyId, 'Timeline').click();
    const response = await audits;
    expect(response.request().postDataJSON().variables).toEqual({ id: companyId });
    await expect(this.timelineDialog).toBeVisible();
    return (await response.json()).data.allyCompanyAudits;
  }

  /** The Status column's words; inactive is spelled "inActive" there. */
  static statusLabel(isActive: boolean): string {
    return isActive ? 'Active' : 'inActive';
  }

  private rowOf(companyId: string): Locator {
    return this.rows.filter({ has: this.page.getByRole('link', { name: companyId, exact: true }) });
  }
}

/** The fields of an `AllyCompanies` row that specs check. */
export interface ListedCompany {
  id: string;
  enName: string;
  arName: string;
  email: string;
  managerName: string;
  phoneNumber: string;
  allyClass: string;
  isActive: boolean;
}

export interface CompanyAudit {
  action: string;
  userName: string;
  oldData: Record<string, unknown>;
  newData: Record<string, unknown>;
}

function companiesIn(body: {
  data?: { allyCompanies?: { collection?: ListedCompany[]; metadata?: { totalCount?: number } } };
}): { companies: ListedCompany[]; total: number } {
  const result = body.data?.allyCompanies;
  return { companies: result?.collection ?? [], total: result?.metadata?.totalCount ?? 0 };
}
