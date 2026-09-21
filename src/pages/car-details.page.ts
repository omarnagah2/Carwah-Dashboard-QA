import { expect, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { BasePage } from './base.page';
import { detailValue, readDetail } from './detail-list.component';

/** A car's page, /cw/dashboard/cars/<id> ("Car Details", from `CarProfile`). */
export class CarDetailsPage extends BasePage {
  readonly heading = this.byRole('heading', { name: 'Car Details', level: 2 });
  readonly backButton = this.byRole('button', { name: 'Back' });

  constructor(page: Page) {
    super(page);
  }

  /** Opens the page and returns the `CarProfile` answer it is built from. */
  async open(carId: string): Promise<Record<string, unknown>> {
    const loaded = this.page.waitForResponse((r) => isOperation(r, 'CarProfile'), { timeout: 30_000 });
    await this.page.goto(`/cw/dashboard/cars/${carId}`, { waitUntil: 'domcontentloaded' });
    const [profile] = Object.values((await (await loaded).json()).data ?? {}) as Record<string, unknown>[];
    await expect(this.heading).toBeVisible();
    await expect(detailValue(this.page, 'Make')).not.toBeEmpty({ timeout: 30_000 });
    return profile;
  }

  async detail(label: string): Promise<string> {
    return readDetail(this.page, label);
  }
}
