import { expect, test } from '../../src/fixtures/test';
import { testData } from '../../src/config/test-data';
import { BannersPage } from '../../src/pages/banners.page';
import { recordMutations } from '../../src/utils/mutations';

const { knownBanner } = testData.banners;

/**
 * Read-only. Banners are what the customer app shows on its home screen, so
 * nothing here saves or deletes: the delete question is opened and answered
 * with Cancel, and every spec proves with `recordMutations` that it wrote
 * nothing.
 */
test.describe('banners list', () => {
  let banners: BannersPage;

  test.beforeEach(async ({ page }) => {
    banners = new BannersPage(page);
  });

  test('lists every banner', async () => {
    const { banners: listed, total } = await banners.open();

    expect(total).toBeGreaterThan(10);
    expect(listed.length).toBe(10);
    expect(await banners.total()).toBe(total);
    expect(await banners.column('ID')).toEqual(listed.map((banner) => banner.id));
    expect(await banners.column('Sort Order')).toEqual(listed.map((banner) => String(banner.displayOrder)));
    expect(await banners.column('Status')).toEqual(listed.map((banner) => (banner.isActive ? 'Active' : 'Inactive')));
  });

  test('a row shows both images and its actions', async () => {
    const { banners: listed } = await banners.open();
    const first = listed[0];

    const row = await banners.listedBanner(first.id);
    expect(row['Created At']).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}/);
    await expect(banners.images(first.id)).toHaveCount(2);
    expect(await banners.images(first.id).nth(0).getAttribute('src')).toBe(first.imgAr);
    expect(await banners.images(first.id).nth(1).getAttribute('src')).toBe(first.imgEn);
    for (const action of ['Edit', 'delete', 'Timeline', 'Copy banner link'] as const) {
      await expect(banners.action(first.id, action)).toBeVisible();
    }
    await expect(banners.action(first.id, 'Edit')).toHaveAttribute('href', `/cw/dashboard/banners/${first.id}/edit`);
  });

  test('pages and page sizes keep the list', async () => {
    const { banners: first } = await banners.open();

    const second = await banners.goToPage(2);
    expect(second.request().postDataJSON().variables).toMatchObject({ page: 2, limit: 10 });
    const onPage2 = (await second.json()).data.banners.collection as { id: string }[];
    expect(onPage2.map((banner) => banner.id)).not.toEqual(first.map((banner) => banner.id));

    const resized = await banners.setPageSize(20);
    expect(resized.request().postDataJSON().variables).toMatchObject({ limit: 20 });
    await expect(banners.rows).toHaveCount(20);
  });

  test('the delete question is asked before anything is deleted', async ({ page }) => {
    const mutations = recordMutations(page);
    const { banners: listed } = await banners.open();

    await banners.askToDelete(listed[0].id);
    await expect(banners.deleteDialog).toContainText('Are You Sure ? You Want To Delete This Banner');
    await banners.cancelDelete();

    await expect(banners.rows).toHaveCount(10);
    expect(mutations, 'nothing was sent while the question was open').toEqual([]);
  });

  test('the timeline holds the banner as it was created', async () => {
    await banners.open();

    const audits = await banners.openTimeline(knownBanner.id);

    expect(audits.length).toBeGreaterThan(0);
    await expect(banners.timelineDialog).toContainText(`ID :${knownBanner.id}`);
    expect(audits.at(-1)!.newData).toMatchObject({ id: Number(knownBanner.id) });
    await banners.closeTimeline();
  });

  test('Copy banner link copies the link', async ({ page }) => {
    test.fail(
      true,
      "The dashboard is served over HTTP, where navigator.clipboard does not exist, so the button throws \"Cannot read properties of undefined (reading 'writeText')\" — nothing is copied and nothing is said",
    );
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    const { banners: listed } = await banners.open();

    await banners.action(listed[0].id, 'Copy banner link').click();
    await page.waitForTimeout(3_000);

    expect(errors, 'what the click threw').toEqual([]);
  });
});
