import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { BasePage } from './base.page';

export type CompanyTab = 'Basic Information' | 'Extra Service' | 'ApI Integration' | 'Settings';

/**
 * The partner form behind Create New Company (/companies/add) and Edit
 * (/companies/<id>/edit): four tabs, then Save — disabled until something
 * changes — and Cancel. Only the suite's own partner is ever saved.
 */
export class CompanyFormPage extends BasePage {
  readonly addHeading = this.byRole('heading', { name: 'Add Company', level: 2 });
  readonly editHeading = this.byRole('heading', { name: 'Edit Company', level: 2 });
  /** Named after its placeholder; holds the local number only. */
  readonly mobile = this.byRole('textbox', { name: '512345678*' });
  readonly saveButton = this.byRole('button', { name: 'Save' });
  readonly cancelButton = this.byRole('button', { name: 'Cancel' });

  constructor(page: Page) {
    super(page);
  }

  tab(name: CompanyTab): Locator {
    return this.byRole('tab', { name, exact: true });
  }

  async openTab(name: CompanyTab): Promise<Locator> {
    await this.tab(name).click();
    await expect(this.tab(name)).toHaveAttribute('aria-selected', 'true');
    return this.byRole('tabpanel', { name });
  }

  field(label: 'Name (Ar)' | 'Name (En)' | 'Manager Name' | 'Email Address' | 'Commercial Registration'): Locator {
    return this.byRole('textbox', { name: label, exact: true });
  }

  numberField(label: 'Commision Rate' | 'Rate value'): Locator {
    return this.byRole('spinbutton', { name: label, exact: true });
  }

  /** A checkbox on the open tab, by its label. */
  checkbox(label: string): Locator {
    return this.byRole('checkbox', { name: label, exact: true });
  }

  /**
   * The Class and Rate react-selects have no labels of their own, so each is
   * found by the text beside it (`Class *`, `Rate *`).
   */
  async choose(field: 'Class' | 'Rate', option: string): Promise<void> {
    const dropdowns = this.page.locator('div.dropdown-select');
    // The label goes away once a value is chosen, so the dropdown is pinned by
    // its position while it still shows it.
    const index = (await dropdowns.allInnerTexts()).findIndex((text) => text.trim().startsWith(`${field} *`));
    expect(index, `a dropdown labelled "${field} *"`).toBeGreaterThanOrEqual(0);
    const dropdown = dropdowns.nth(index);
    await dropdown.click();
    await this.page
      .locator('[id*="-option-"]')
      .filter({ hasText: new RegExp(`^\\s*${option}\\s*$`) })
      .first()
      .click();
    await expect(dropdown).toContainText(option);
  }

  async openEdit(companyId: string): Promise<void> {
    await this.page.goto(`/cw/dashboard/companies/${companyId}/edit`, { waitUntil: 'domcontentloaded' });
    await expect(this.editHeading).toBeVisible({ timeout: 30_000 });
    await expect(this.field('Name (En)')).not.toHaveValue('', { timeout: 30_000 });
  }

  /**
   * Save sends the whole form as `UpdateAllyCompany` (with `allyCompanyId`,
   * the images as the URLs they were loaded with, and every extra service)
   * and returns to the partners list. Returns what was sent.
   */
  async save(): Promise<Record<string, unknown>> {
    const response = await this.saving();
    const body = await response.json();
    const result = body.data?.updateAllyCompany;
    expect(body.errors ?? result?.errors, `UpdateAllyCompany answered ${JSON.stringify(body)}`).toEqual([]);
    expect(result.status).toBe('success');
    await expect(this.page).toHaveURL(/\/cw\/dashboard\/companies$/);
    return response.request().postDataJSON().variables;
  }

  /** Save when the API is expected to refuse; returns its error messages. */
  async saveExpectingErrors(): Promise<string[]> {
    const body = await (await this.saving()).json();
    const errors = [...(body.errors ?? []), ...(body.data?.updateAllyCompany?.errors ?? [])];
    expect(errors, 'the API refused the save').not.toEqual([]);
    return errors.map((error: { message?: string } | string) => (typeof error === 'string' ? error : (error.message ?? '')));
  }

  private async saving(): Promise<Response> {
    const saved = this.page.waitForResponse((r) => isOperation(r, 'UpdateAllyCompany'), { timeout: 30_000 });
    await this.saveButton.click();
    return saved;
  }

  /** Leaves without saving; the form returns to the partners list. */
  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await expect(this.page).toHaveURL(/\/cw\/dashboard\/companies$/);
  }
}
