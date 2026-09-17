import { expect, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { BasePage } from './base.page';
import { detailValue, readDetail } from './detail-list.component';

/** A customer's page, /cw/dashboard/customers/<id>. */
export class CustomerDetailsPage extends BasePage {
  readonly heading = this.byRole('heading', { name: 'Customer Details', level: 2 });
  readonly editButton = this.byRole('button', { name: 'Edit Customer' });

  constructor(page: Page) {
    super(page);
  }

  async open(customerId: string): Promise<void> {
    const details = this.page.waitForResponse((r) => isOperation(r, 'GetCustomerDetailsQuery'), { timeout: 30_000 });
    await this.page.goto(`/cw/dashboard/customers/${customerId}`, { waitUntil: 'domcontentloaded' });
    await details;
    await this.expectLoaded();
  }

  async expectLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
    // Pacing can hold the details query for several seconds.
    await expect(detailValue(this.page, 'Mobile Number')).not.toBeEmpty({ timeout: 30_000 });
  }

  async detail(label: string): Promise<string> {
    return readDetail(this.page, label);
  }

  async edit(): Promise<void> {
    await this.editButton.click();
    await expect(this.page).toHaveURL(/\/cw\/dashboard\/customers\/\d+\/edit$/);
  }
}
