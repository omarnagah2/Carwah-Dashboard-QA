import { expect, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { BasePage } from './base.page';
import { detailValue, readDetail } from './detail-list.component';

/**
 * An extra service's page, /cw/dashboard/extraservices/<id> ("ExtraService
 * Details", from `ExtraService { id }`). Its one card is headed **"Feature
 * Details"** and lists Service ID, the two descriptions, Pay Type, Status and
 * Show — the titles the list shows are not on it.
 */
export class ExtraServiceDetailsPage extends BasePage {
  readonly heading = this.byRole('heading', { name: 'ExtraService Details' }).first();
  readonly editButton = this.byRole('button', { name: 'Edit' });
  readonly backButton = this.byRole('button', { name: 'Back' });

  constructor(page: Page) {
    super(page);
  }

  /** Opens the page and returns the `ExtraService` answer it is built from. */
  async open(serviceId: string): Promise<ExtraServiceProfile> {
    const loaded = this.page.waitForResponse((r) => isOperation(r, 'ExtraService'), { timeout: 30_000 });
    await this.page.goto(`/cw/dashboard/extraservices/${serviceId}`, { waitUntil: 'domcontentloaded' });
    const [service] = Object.values((await (await loaded).json()).data ?? {}) as ExtraServiceProfile[];
    await expect(this.heading).toBeVisible();
    await expect(detailValue(this.page, 'Service ID')).not.toBeEmpty({ timeout: 30_000 });
    return service;
  }

  async detail(label: string): Promise<string> {
    return readDetail(this.page, label);
  }

  /** Every label the card lists, in order. */
  async labels(): Promise<string[]> {
    const labels = await this.page.locator('li.list_item_info span.text-align-localized').allInnerTexts();
    return labels.map((label) => label.trim());
  }
}

/** The fields of `ExtraService` the specs check. */
export interface ExtraServiceProfile {
  id: string;
  enTitle: string;
  arTitle: string;
  enDescription: string;
  arDescription: string;
  payType: string;
  isActive: boolean;
  isDisplayed: boolean;
  isSpecial: boolean;
  iconUrl: string | null;
  homepageIconUrl: string | null;
}
