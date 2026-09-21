import { expect, type Locator, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { BasePage } from './base.page';
import { detailValue, readDetail } from './detail-list.component';

/** The API's view of a branch, as the details page loads it. */
export interface BranchProfile {
  id: string;
  name: string;
  enName: string;
  arName: string;
  address: string;
  officeNumber: string;
  isActive: boolean;
  branchClass: string;
  branchState: string;
  carCount: number;
  canDelivery: boolean;
  area: { enName: string; name: string };
  allyCompany: { phoneNumber: string };
  branchWorkingDays: { weekDay: number; isOn: boolean; startTime: string; endTime: string; is24hAvailable: boolean }[];
}

export const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** A branch's page, /cw/dashboard/branches/<id> ("Branch Details"). */
export class BranchDetailsPage extends BasePage {
  readonly heading = this.byRole('heading', { name: 'Branch Details', level: 2 });
  readonly shiftsHeading = this.byRole('heading', { name: 'Work Time Shifts', level: 2 });

  constructor(page: Page) {
    super(page);
  }

  /** Opens the page and returns the `Branch` answer it is built from. */
  async open(branchId: string): Promise<BranchProfile> {
    const loaded = this.page.waitForResponse((r) => isOperation(r, 'Branch'), { timeout: 30_000 });
    await this.page.goto(`/cw/dashboard/branches/${branchId}`, { waitUntil: 'domcontentloaded' });
    const profile = (await (await loaded).json()).data.branch as BranchProfile;
    await expect(this.heading).toBeVisible();
    await expect(detailValue(this.page, 'Branch Name')).not.toBeEmpty({ timeout: 30_000 });
    return profile;
  }

  async detail(label: string): Promise<string> {
    return readDetail(this.page, label);
  }

  /** A day under Work Time Shifts; clicking it shows that day's hours. */
  day(name: (typeof WEEK_DAYS)[number]): Locator {
    return this.byRole('button', { name, exact: true });
  }

  /**
   * Opens a day under Work Time Shifts and returns what it reveals — the
   * day's name, then Start Time and End Time with its hours.
   */
  async openDay(name: (typeof WEEK_DAYS)[number]): Promise<string> {
    const item = this.byRole('listitem').filter({ has: this.day(name) });
    await this.day(name).click();
    await expect(item.getByText('Start Time')).toBeVisible();
    return (await item.innerText()).replace(/\s+/g, ' ').trim();
  }
}
