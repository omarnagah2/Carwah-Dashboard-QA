import { expect, type Locator, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { ListPage } from './list.page';

/**
 * The banners list at /cw/dashboard/banners. Like extra services it has no
 * filter panel, and no details page either — a banner is only ever opened
 * for editing.
 */
export class BannersPage extends ListPage {
  readonly createButton = this.byRole('button', { name: 'Create New Banner' });
  readonly timelineDialog = this.byRole('dialog').filter({ hasText: 'Banner TimeLine' });
  readonly deleteDialog = this.page.locator('.swal-modal').filter({ hasText: 'You Want To Delete This Banner' });

  constructor(page: Page) {
    super(page, 'Sort Order', 'AllBanners');
  }

  async open(): Promise<{ banners: ListedBanner[]; total: number }> {
    const response = await this.openAt('/cw/dashboard/banners');
    await expect(this.rows.first()).toBeVisible();
    return bannersIn(await response.json());
  }

  async listedBanner(bannerId: string): Promise<Record<string, string>> {
    return this.row('ID', bannerId);
  }

  /** A row's Actions: Edit, delete, Timeline and Copy banner link. */
  action(bannerId: string, title: 'Edit' | 'delete' | 'Timeline' | 'Copy banner link'): Locator {
    return this.rowOf(bannerId).getByTitle(title, { exact: true });
  }

  /** The row's two images, Arabic then English. */
  images(bannerId: string): Locator {
    return this.rowOf(bannerId).locator('img');
  }

  /**
   * Opens the delete question — **never answered with delete**: these banners
   * are what the app shows its customers.
   */
  async askToDelete(bannerId: string): Promise<void> {
    await this.action(bannerId, 'delete').click();
    await expect(this.deleteDialog).toBeVisible();
  }

  /** Answers it with Cancel; a closed SweetAlert only fades out (see branches). */
  async cancelDelete(): Promise<void> {
    await this.deleteDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(this.page.locator('.swal-overlay--show-modal')).toHaveCount(0);
  }

  /** Opens a banner's Timeline and returns what `BannerAuditsQuery` answered. */
  async openTimeline(bannerId: string): Promise<BannerAudit[]> {
    const audits = this.page.waitForResponse((r) => isOperation(r, 'BannerAuditsQuery'), { timeout: 30_000 });
    await this.action(bannerId, 'Timeline').click();
    const response = await audits;
    await expect(this.timelineDialog).toBeVisible();
    const [entries] = Object.values((await response.json()).data ?? {}) as BannerAudit[][];
    return entries ?? [];
  }

  async closeTimeline(): Promise<void> {
    await this.timelineDialog.getByRole('button').last().click();
    await expect(this.timelineDialog).toBeHidden();
  }

  private rowOf(bannerId: string): Locator {
    return this.rows.filter({ has: this.page.locator(`a[href="/cw/dashboard/banners/${bannerId}/edit"]`) });
  }
}

/** A banner as the list query returns it (under `banners`). */
export interface ListedBanner {
  id: string;
  displayOrder: number;
  imgAr: string;
  imgEn: string;
  isActive: boolean;
  isDeepLink: boolean;
  createdAt: string;
}

export interface BannerAudit {
  action?: string;
  userName?: string;
  oldData: Record<string, unknown>;
  newData: Record<string, unknown>;
}

function bannersIn(body: {
  data?: { banners?: { collection?: ListedBanner[]; metadata?: { totalCount?: number } } };
}): { banners: ListedBanner[]; total: number } {
  // `AllBanners` answers under `banners`.
  const result = body.data?.banners;
  return { banners: result?.collection ?? [], total: result?.metadata?.totalCount ?? 0 };
}
