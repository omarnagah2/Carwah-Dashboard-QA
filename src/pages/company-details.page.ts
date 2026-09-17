import { expect, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { BasePage } from './base.page';
import { detailValue, readDetail } from './detail-list.component';

/** The API's view of a partner, as the details page loads it. */
export interface CompanyProfile {
  id: string;
  enName: string;
  arName: string;
  email: string;
  phoneNumber: string;
  allyClass: string;
  managerName: string;
  commercialRegestration: string;
  isActive: boolean;
  isOnlinePayEnable: boolean;
  isB2b: boolean;
  isB2c: boolean;
  isExtendFixedPrice: boolean;
  allyRate: { name: string } | null;
}

export type CompanySetting = 'Enable Online Payment' | 'B2B (Carwah business)' | 'Not B2C' | 'Extend - rental fixed price';

/** A partner's page, /cw/dashboard/companies/<id> ("Ally Details"). */
export class CompanyDetailsPage extends BasePage {
  readonly heading = this.byRole('heading', { name: 'Ally Details', level: 2 });

  constructor(page: Page) {
    super(page);
  }

  /** Opens the page and returns the `AllyCompany` answer it is built from. */
  async open(companyId: string): Promise<CompanyProfile> {
    const loaded = this.page.waitForResponse((r) => isOperation(r, 'AllyCompany'), { timeout: 30_000 });
    await this.page.goto(`/cw/dashboard/companies/${companyId}`, { waitUntil: 'domcontentloaded' });
    const profile = (await (await loaded).json()).data.allyCompany as CompanyProfile;
    await expect(this.heading).toBeVisible();
    await expect(detailValue(this.page, 'Ally Name')).not.toBeEmpty({ timeout: 30_000 });
    return profile;
  }

  async detail(label: string): Promise<string> {
    return readDetail(this.page, label);
  }

  /**
   * Ally Settings are detail items whose value is an icon: a red ✗ when the
   * setting is off, otherwise on.
   */
  async setting(label: CompanySetting): Promise<boolean> {
    const icon = detailValue(this.page, label).locator('svg');
    await expect(icon).toBeVisible();
    return !(await icon.getAttribute('style'))?.includes('red');
  }
}
