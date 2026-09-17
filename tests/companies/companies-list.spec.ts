import { expect, test } from '../../src/fixtures/test';
import { testData } from '../../src/config/test-data';
import { CompaniesPage } from '../../src/pages/companies.page';
import { CompanyDetailsPage } from '../../src/pages/company-details.page';
import { CompanyFormPage } from '../../src/pages/company-form.page';
import { recordMutations } from '../../src/utils/mutations';

const { knownAlly } = testData.companies;

const COLUMNS = ['#', 'ID', 'Ally Name', 'Company Logo', 'Manager Name', 'phone Number', 'Status', 'Class', 'Email', 'Actions'];

/**
 * Read-only. Partners are real companies that bookings depend on, so the
 * specs never save a form or flip a row's active switch.
 */
test.describe('partners list', () => {
  let companies: CompaniesPage;

  test.beforeEach(async ({ page }) => {
    companies = new CompaniesPage(page);
  });

  test('lists every partner, newest first, with their columns', async () => {
    const { companies: listed, total } = await companies.open();

    expect(total).toBeGreaterThan(10);
    expect(await companies.total()).toBe(total);
    await expect(companies.rows).toHaveCount(10);
    const ids = listed.map((c) => Number(c.id));
    expect(ids).toEqual([...ids].sort((a, b) => b - a));

    const [first] = listed;
    const row = await companies.listedCompany(first.id);
    expect(Object.keys(row)).toEqual(COLUMNS);
    expect(row).toMatchObject({
      '#': '1',
      'Ally Name': first.enName,
      'Manager Name': first.managerName,
      'phone Number': first.phoneNumber,
      Status: CompaniesPage.statusLabel(first.isActive),
      Class: first.allyClass,
      Email: first.email,
    });
    await expect(companies.action(first.id, 'Edit')).toHaveAttribute('href', `/cw/dashboard/companies/${first.id}/edit`);
    await expect(companies.action(first.id, 'Timeline')).toBeVisible();
    await expect(companies.createButton).toBeVisible();
  });

  test('each row’s active switch shows the partner’s status', async () => {
    const { companies: listed } = await companies.open();

    for (const company of listed) {
      const toggle = companies.activeSwitch(company.id);
      if (company.isActive) {
        await expect(toggle, `partner ${company.id}`).toBeChecked();
      } else {
        await expect(toggle, `partner ${company.id}`).not.toBeChecked();
      }
    }
  });

  test('opens a partner’s details', async ({ page }) => {
    await companies.open();
    await companies.filters.open();
    await companies.filters.choose('Ally Name', knownAlly.name);
    await companies.search();

    await companies.openCompany(knownAlly.id);
    const details = new CompanyDetailsPage(page);
    const profile = await details.open(knownAlly.id);

    expect(profile.enName).toBe(knownAlly.name);
    expect(await details.detail('Ally Name')).toBe(profile.enName);
    expect(await details.detail('Email Address')).toBe(profile.email);
    expect(await details.detail('Commercial Registration')).toBe(profile.commercialRegestration);
    expect(await details.detail('Mobile number.')).toBe(profile.phoneNumber);
    expect(await details.detail('Ally Class')).toBe(profile.allyClass);
    expect(await details.detail('Manager Name')).toBe(profile.managerName);
    // Two labels are untranslated i18n keys (known issue).
    expect(await details.detail('ally.id')).toBe(knownAlly.id);
    expect(await details.detail('ally.status')).toBe(profile.isActive ? 'Active' : 'Inactive');

    expect(await details.setting('Enable Online Payment')).toBe(profile.isOnlinePayEnable);
    expect(await details.setting('B2B (Carwah business)')).toBe(profile.isB2b);
    // A ✗ beside "Not B2C" means the partner does serve B2C.
    expect(await details.setting('Not B2C')).toBe(!profile.isB2c);
    expect(await details.setting('Extend - rental fixed price')).toBe(profile.isExtendFixedPrice);
  });

  test('the details page labels its ID and status in plain words', async ({ page }) => {
    test.fail(true, 'Ally Details shows the untranslated keys "ally.id" and "ally.status" as labels');
    const details = new CompanyDetailsPage(page);
    await details.open(knownAlly.id);

    await expect(page.locator('li.list_item_info span.text-align-localized').filter({ hasText: /^ally\./ })).toHaveCount(0);
  });

  test('opens the edit form filled with the partner, and leaves without saving', async ({ page }) => {
    const mutations = recordMutations(page);
    const profile = await new CompanyDetailsPage(page).open(knownAlly.id);
    const form = new CompanyFormPage(page);

    await form.openEdit(knownAlly.id);

    for (const tab of ['Basic Information', 'Extra Service', 'ApI Integration', 'Settings'] as const) {
      await expect(form.tab(tab)).toBeVisible();
    }
    await expect(form.field('Name (En)')).toHaveValue(profile.enName);
    await expect(form.field('Name (Ar)')).toHaveValue(profile.arName);
    await expect(form.field('Manager Name')).toHaveValue(profile.managerName);
    await expect(form.field('Email Address')).toHaveValue(profile.email);
    await expect(form.field('Commercial Registration')).toHaveValue(profile.commercialRegestration);
    // The mobile field holds the local number.
    await expect(form.mobile).toHaveValue(profile.phoneNumber.replace(/^966/, ''));
    // Nothing has changed yet.
    await expect(form.saveButton).toBeDisabled();

    const settings = await form.openTab('Settings');
    await expect(settings.getByRole('checkbox', { name: 'Extend - rental fixed price' })).toBeChecked({ checked: profile.isExtendFixedPrice });
    await expect(settings.getByRole('checkbox', { name: 'B2B (Carwah business)' })).toBeChecked({ checked: profile.isB2b });
    await expect(settings.getByRole('checkbox', { name: 'Not B2C' })).toBeChecked({ checked: !profile.isB2c });

    const extras = await form.openTab('Extra Service');
    await expect(extras.getByRole('columnheader', { name: 'Service Value' })).toBeVisible();
    await expect(extras.locator('tbody tr').first()).toBeVisible();

    await form.cancel();
    expect(mutations).toEqual([]);
  });

  test('Timeline opens the partner’s audit log', async () => {
    await companies.open();
    await companies.filters.open();
    await companies.filters.choose('Ally Name', knownAlly.name);
    await companies.search();

    const audits = await companies.openTimeline(knownAlly.id);

    await expect(companies.timelineDialog).toContainText(`Company Id :${knownAlly.id}`);
    if (audits.length > 0) {
      await expect(companies.timelineDialog.getByRole('heading', { name: 'old Data' })).toHaveCount(audits.length);
      expect(audits[0].userName).toBeTruthy();
    }
    await companies.timelineDialog.getByRole('button', { name: 'Close' }).first().click();
    await expect(companies.timelineDialog).toBeHidden();
  });

  test('Create New Company opens an empty form that cannot be saved yet', async ({ page }) => {
    const mutations = recordMutations(page);
    await companies.open();

    await companies.createButton.click();

    const form = new CompanyFormPage(page);
    await expect(page).toHaveURL(/\/cw\/dashboard\/companies\/add$/);
    await expect(form.addHeading).toBeVisible();
    await expect(form.field('Name (En)')).toHaveValue('');
    await expect(form.field('Email Address')).toHaveValue('');
    await expect(form.saveButton).toBeDisabled();
    await form.cancel();
    expect(mutations).toEqual([]);
  });

  test('the next page shows older partners', async () => {
    const { companies: firstPage } = await companies.open();

    const response = await companies.goToPage(2);

    expect(response.request().postDataJSON().variables).toMatchObject({ page: 2 });
    const secondIds = (await companies.column('ID')).map(Number);
    expect(secondIds.length).toBeGreaterThan(0);
    expect(Math.max(...secondIds)).toBeLessThan(Math.min(...firstPage.map((c) => Number(c.id))));
  });

  test('shows 25 partners a page', async () => {
    await companies.open();

    const response = await companies.setPageSize(25);

    expect(response.request().postDataJSON().variables).toMatchObject({ limit: 25 });
    await expect(companies.rows).toHaveCount(25);
  });
});
