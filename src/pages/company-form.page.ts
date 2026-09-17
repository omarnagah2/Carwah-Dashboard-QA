import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './base.page';

export type CompanyTab = 'Basic Information' | 'Extra Service' | 'ApI Integration' | 'Settings';

/**
 * The partner form behind Create New Company (/companies/add) and Edit
 * (/companies/<id>/edit): four tabs, then Save — disabled until something
 * changes — and Cancel. Specs only read it.
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

  async openEdit(companyId: string): Promise<void> {
    await this.page.goto(`/cw/dashboard/companies/${companyId}/edit`, { waitUntil: 'domcontentloaded' });
    await expect(this.editHeading).toBeVisible({ timeout: 30_000 });
    await expect(this.field('Name (En)')).not.toHaveValue('', { timeout: 30_000 });
  }

  /** Leaves without saving; the form returns to the partners list. */
  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await expect(this.page).toHaveURL(/\/cw\/dashboard\/companies$/);
  }
}
