import type { Page } from '@playwright/test';
import { authFile } from '../../src/config/auth';
import { testData } from '../../src/config/test-data';
import { expect, prepareContext, test } from '../../src/fixtures/test';
import { CompaniesPage, type CompanyAudit } from '../../src/pages/companies.page';
import { CompanyDetailsPage, type CompanyProfile } from '../../src/pages/company-details.page';
import { CompanyFormPage } from '../../src/pages/company-form.page';

const { testAlly } = testData.companies;

/** The three fields the spec moves between its two states. */
interface Basics {
  managerName: string;
  commissionRate: number;
  isB2b: boolean;
}

/**
 * Writes, but only ever to **the suite's own partner** (`testAlly`, added by
 * `add-company.spec.ts`): it activates it, saves an edit, checks it, puts the
 * fields back and deactivates it again — so the partner ends each run as it
 * started, inactive, and no new partners are created (partners cannot be
 * deleted). Serial and never retried.
 */
test.describe('partner edit', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  let page: Page;
  let companies: CompaniesPage;
  let form: CompanyFormPage;
  let details: CompanyDetailsPage;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ storageState: authFile });
    await prepareContext(page.context());
    companies = new CompaniesPage(page);
    form = new CompanyFormPage(page);
    details = new CompanyDetailsPage(page);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  /** Puts the three fields into `basics` and saves; returns what was sent. */
  async function setBasics(basics: Basics): Promise<Record<string, unknown>> {
    await form.openEdit(testAlly.id);
    await form.field('Manager Name').fill(basics.managerName);
    await form.numberField('Commision Rate').fill(String(basics.commissionRate));
    const settings = await form.openTab('Settings');
    const b2b = settings.getByRole('checkbox', { name: 'B2B (Carwah business)' });
    if ((await b2b.isChecked()) !== basics.isB2b) {
      await b2b.click();
    }
    await expect(b2b).toBeChecked({ checked: basics.isB2b });
    await form.openTab('Basic Information');
    return form.save();
  }

  function expectProfile(profile: CompanyProfile, basics: Basics): void {
    expect({
      managerName: profile.managerName,
      commissionRate: (profile as CompanyProfile & { commisionRate: number }).commisionRate,
      isB2b: profile.isB2b,
    }).toEqual(basics);
  }

  test('the suite’s partner is there, inactive', async () => {
    const profile = await details.open(testAlly.id);

    expect(profile.enName, 'the suite’s own test partner').toMatch(/^Automated Ally /);
    // Left inactive by every run; activating it is the first step below.
    expect(profile.isActive).toBe(false);
  });

  test('activate it', async () => {
    await companies.open();
    await companies.filters.open();
    await companies.filters.managerName.fill('Automation');
    const { companies: found } = await companies.search();
    expect(found.map((c) => c.id)).toContain(testAlly.id);

    await companies.setActive(testAlly.id, true);

    expect((await companies.listedCompany(testAlly.id)).Status).toBe(CompaniesPage.statusLabel(true));
    expect(await details.open(testAlly.id)).toMatchObject({ isActive: true });
  });

  test('save an edit', async () => {
    const sent = await setBasics(testAlly.edited);

    expect(sent).toMatchObject({
      allyCompanyId: testAlly.id,
      managerName: testAlly.edited.managerName,
      commisionRate: testAlly.edited.commissionRate,
      isB2b: testAlly.edited.isB2b,
      // The rest of the form goes out untouched.
      isActive: true,
      allyClass: 'D',
    });
    expect(sent.licenceImage).toEqual(expect.stringContaining('/image_upload/'));
  });

  test('the edit shows on the details page and in the list', async () => {
    const profile = await details.open(testAlly.id);
    expectProfile(profile, testAlly.edited);

    expect(await details.detail('Manager Name')).toBe(testAlly.edited.managerName);
    expect(await details.setting('B2B (Carwah business)')).toBe(true);

    await companies.open();
    await companies.filters.open();
    await companies.filters.managerName.fill(testAlly.edited.managerName);
    const { companies: found } = await companies.search();
    expect(found.map((c) => c.id)).toContain(testAlly.id);
    expect((await companies.listedCompany(testAlly.id))['Manager Name']).toBe(testAlly.edited.managerName);
  });

  test('the timeline records the change', async () => {
    await companies.open();
    await companies.filters.open();
    await companies.filters.managerName.fill(testAlly.edited.managerName);
    await companies.search();

    const audits: CompanyAudit[] = await companies.openTimeline(testAlly.id);

    const change = audits.find((audit) => 'manager_name' in audit.newData);
    expect(change, 'an entry naming the manager').toBeDefined();
    expect(change!.newData).toMatchObject({ manager_name: testAlly.edited.managerName });
    expect(change!.oldData).toMatchObject({ manager_name: testAlly.baseline.managerName });
    expect(change!.action).toBe('update');
    await companies.timelineDialog.getByRole('button', { name: 'Close' }).first().click();
  });

  test('a manager name over the limit is refused, and the page says so', async () => {
    test.fail(true, 'The API refuses a manager name over 20 characters and the page shows nothing at all');
    await form.openEdit(testAlly.id);

    await form.field('Manager Name').fill('Automation Manager Edited');
    const errors = await form.saveExpectingErrors();

    expect(errors.join(' ')).toContain('Manager name is too long');
    // Nothing on screen says the save failed — no toast, no field error.
    await expect(page.locator('.Toastify').getByText(/too long|error|failed/i)).toBeVisible({ timeout: 5_000 });
  });

  test('put the partner back and deactivate it', async () => {
    const sent = await setBasics(testAlly.baseline);
    expect(sent).toMatchObject({
      managerName: testAlly.baseline.managerName,
      commisionRate: testAlly.baseline.commissionRate,
      isB2b: testAlly.baseline.isB2b,
    });
    expectProfile(await details.open(testAlly.id), testAlly.baseline);

    await companies.open();
    await companies.filters.open();
    await companies.filters.managerName.fill(testAlly.baseline.managerName);
    await companies.search();
    await companies.setActive(testAlly.id, false);

    expect(await details.open(testAlly.id)).toMatchObject({ isActive: false });
  });
});
