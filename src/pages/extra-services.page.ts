import { expect, type Locator, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { ListPage } from './list.page';

/**
 * The extra services list at /cw/dashboard/extraservice ("Extra Service").
 * There is no filter panel here — the list is the whole page.
 */
export class ExtraServicesPage extends ListPage {
  readonly createButton = this.byRole('button', { name: 'Create New Extra Service' });
  readonly timelineDialog = this.byRole('dialog').filter({ hasText: 'ExtraService Timeline' });
  readonly deleteDialog = this.page.locator('.swal-modal').filter({ hasText: 'You Want To Delete This Service' });

  constructor(page: Page) {
    super(page, 'Service ID', 'ExtraServices');
  }

  async open(): Promise<{ services: ListedExtraService[]; total: number }> {
    const response = await this.openAt('/cw/dashboard/extraservice');
    await expect(this.rows.first()).toBeVisible();
    return servicesIn(await response.json());
  }

  /** One listed service as header → cell text. */
  async listedService(serviceId: string): Promise<Record<string, string>> {
    return this.row('Service ID', serviceId);
  }

  /** A row's Actions: Edit is a link, delete asks first, Timeline opens a dialog. */
  action(serviceId: string, title: 'Edit' | 'delete' | 'Timeline'): Locator {
    return this.rowOf(serviceId).getByTitle(title, { exact: true });
  }

  /**
   * Opens the delete question — **never answered with delete**: these are the
   * services real bookings are charged for. `cancelDelete` closes it.
   */
  async askToDelete(serviceId: string): Promise<void> {
    await this.action(serviceId, 'delete').click();
    await expect(this.deleteDialog).toBeVisible();
  }

  /**
   * Answers the question with Cancel. As on branches, SweetAlert only fades a
   * closed alert out and keeps it in the page, so "closed" is read from the
   * overlay losing `swal-overlay--show-modal`.
   */
  async cancelDelete(): Promise<void> {
    await this.deleteDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(this.page.locator('.swal-overlay--show-modal')).toHaveCount(0);
  }

  /** Opens a service's Timeline and returns what `ExtraServiceAudits` answered. */
  async openTimeline(serviceId: string): Promise<ExtraServiceAudit[]> {
    const audits = this.page.waitForResponse((r) => isOperation(r, 'ExtraServiceAudits'), { timeout: 30_000 });
    await this.action(serviceId, 'Timeline').click();
    const response = await audits;
    await expect(this.timelineDialog).toBeVisible();
    const [entries] = Object.values((await response.json()).data ?? {}) as ExtraServiceAudit[][];
    return entries ?? [];
  }

  async closeTimeline(): Promise<void> {
    await this.timelineDialog.getByRole('button').last().click();
    await expect(this.timelineDialog).toBeHidden();
  }

  /**
   * The row's link to the service. **The details page is the only plural
   * path** on this page (`/extraservices/<id>`, while the list, edit and add
   * are all `/extraservice/…`).
   */
  private rowOf(serviceId: string): Locator {
    return this.rows.filter({ has: this.page.locator(`a[href="/cw/dashboard/extraservices/${serviceId}"]`) });
  }
}

/** An extra service as the list query returns it. */
export interface ListedExtraService {
  id: string;
  enTitle: string;
  arTitle: string;
  enDescription: string;
  arDescription: string;
  isActive: boolean;
  payType: string;
}

export interface ExtraServiceAudit {
  action?: string;
  userName?: string;
  oldData: Record<string, unknown>;
  newData: Record<string, unknown>;
}

function servicesIn(body: {
  data?: { extraServices?: { collection?: ListedExtraService[]; metadata?: { totalCount?: number } } };
}): { services: ListedExtraService[]; total: number } {
  const result = body.data?.extraServices;
  return { services: result?.collection ?? [], total: result?.metadata?.totalCount ?? 0 };
}
