import { expect, type Locator, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { CustomerFilters } from './customer-filters.component';
import { ListPage } from './list.page';

/**
 * The customers list at /cw/dashboard/customers. It lists nothing until a
 * search names a customer (see CLAUDE.md).
 */
export class CustomersPage extends ListPage {
  readonly filters = new CustomerFilters(this.page);
  readonly addButton = this.byRole('button', { name: 'Add customer' });
  readonly timelineDialog = this.byRole('dialog').filter({ hasText: 'Customer TimeLine' });

  constructor(page: Page) {
    super(page, 'Customer ID', 'GetUsersList');
  }

  /** Returns the customers the page loaded with. */
  async open(): Promise<ListedCustomer[]> {
    const response = await this.openAt('/cw/dashboard/customers');
    await expect(this.rows.first().or(this.noRecords)).toBeVisible();
    return customersIn(await response.json());
  }

  /** Runs the search in the filter panel; returns what was sent and found. */
  async search(): Promise<{ query: Record<string, unknown>; customers: ListedCustomer[] }> {
    const response = await this.reloadingList(() => this.filters.searchButton.click());
    return { query: response.request().postDataJSON().variables, customers: customersIn(await response.json()) };
  }

  /**
   * Clear sends no query: it returns the list to its unfiltered, empty state,
   * which the page already holds from loading.
   */
  async clearFilters(): Promise<void> {
    await this.filters.clearButton.click();
    await expect(this.noRecords).toBeVisible();
    await expect(this.filters.customerName).toHaveValue('');
  }

  async findByMobile(localNumber: string): Promise<ListedCustomer[]> {
    await this.filters.open();
    await this.filters.mobile.fill(localNumber);
    return (await this.search()).customers;
  }

  async listedCustomer(customerId: string): Promise<Record<string, string>> {
    return this.row('Customer ID', customerId);
  }

  async openCustomer(customerId: string): Promise<void> {
    await this.table.getByRole('link', { name: customerId, exact: true }).click();
    await expect(this.page).toHaveURL(new RegExp(`/cw/dashboard/customers/${customerId}$`));
  }

  /** A row's Actions cell: Edit, delete and Timeline icons. */
  action(customerId: string, title: 'Edit' | 'delete' | 'Timeline'): Locator {
    return this.rowOf(customerId).getByTitle(title, { exact: true });
  }

  bookingsLink(customerId: string): Locator {
    return this.rowOf(customerId).getByRole('link', { name: 'Bookings', exact: true });
  }

  /** Opens a customer's Timeline and returns what `CustomerAudits` answered. */
  async openTimeline(customerId: string): Promise<unknown[]> {
    const audits = this.page.waitForResponse((r) => isOperation(r, 'CustomerAudits'), { timeout: 30_000 });
    await this.action(customerId, 'Timeline').click();
    const response = await audits;
    expect(response.request().postDataJSON().variables).toEqual({ id: customerId });
    await expect(this.timelineDialog).toBeVisible();
    return (await response.json()).data.customerAudits;
  }

  /**
   * The delete icon asks "Are You Sure ? You Want Delete This Customer"
   * (Cancel / delete); delete sends `DeleteCustomer { input: { userId } }`
   * and reloads the list. Deleting is soft: the details page still opens, with
   * Status "Deleted", and searches no longer find the customer.
   */
  async deleteCustomer(customerId: string): Promise<void> {
    await this.action(customerId, 'delete').click();
    const dialog = this.byRole('dialog').filter({ hasText: 'You Want Delete This Customer' });
    const deleted = this.page.waitForResponse((r) => isOperation(r, 'DeleteCustomer'), { timeout: 30_000 });
    await this.reloadingList(async () => {
      await dialog.getByRole('button', { name: 'delete', exact: true }).click();
      const response = await deleted;
      expect(response.request().postDataJSON().variables).toEqual({ input: { userId: Number(customerId) } });
      const body = await response.json();
      expect(body.data?.deleteCustomer?.status, `DeleteCustomer answered ${JSON.stringify(body)}`).toBe('success');
    });
    await expect(dialog).toBeHidden();
  }

  private rowOf(customerId: string): Locator {
    return this.rows.filter({ has: this.page.getByRole('link', { name: customerId, exact: true }) });
  }
}

/** The fields of a `GetUsersList` row that specs check. */
export interface ListedCustomer {
  id: string;
  name: string;
  email: string;
  mobile: string;
  isActive: boolean;
  /** citizen, resident, gulf_citizen, visitor — or null. */
  status: string | null;
  customerProfile: { blockingStatus: string | null; isYakeenVerified: boolean };
  agencyCustomerProfiles: { agencyId: number; isActive: boolean }[];
}

function customersIn(body: { data?: { users?: { collection?: ListedCustomer[] } } }): ListedCustomer[] {
  return body.data?.users?.collection ?? [];
}
