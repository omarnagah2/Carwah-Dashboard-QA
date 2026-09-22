import { expect, test } from '../../src/fixtures/test';
import { testData } from '../../src/config/test-data';
import { ExtraServiceDetailsPage } from '../../src/pages/extra-service-details.page';
import { ExtraServicesPage } from '../../src/pages/extra-services.page';
import { recordMutations } from '../../src/utils/mutations';

const { knownService } = testData.extraServices;

/**
 * Read-only. These are the services real bookings are charged for, so no spec
 * saves the form and **the delete question is only ever answered with
 * Cancel**. There is no filter panel on this page.
 */
test.describe('extra services list', () => {
  let services: ExtraServicesPage;

  test.beforeEach(async ({ page }) => {
    services = new ExtraServicesPage(page);
  });

  test('lists every extra service', async () => {
    const { services: listed, total } = await services.open();

    expect(total).toBeGreaterThan(30);
    expect(listed.length).toBe(10);
    expect(await services.total()).toBe(total);
    expect(await services.column('Service ID')).toEqual(listed.map((service) => service.id));
    expect(await services.column('En Title')).toEqual(listed.map((service) => service.enTitle));
  });

  test('a row carries the service, its status and its actions', async () => {
    const { services: listed } = await services.open();
    const first = listed[0];

    const row = await services.listedService(first.id);
    expect(row['Ar Title']).toBe(first.arTitle);
    expect(row.Status).toBe(first.isActive ? 'Active' : 'Inactive');
    for (const action of ['Edit', 'delete', 'Timeline'] as const) {
      await expect(services.action(first.id, action)).toBeVisible();
    }
    await expect(services.action(first.id, 'Edit')).toHaveAttribute('href', `/cw/dashboard/extraservice/${first.id}/edit`);
  });

  test('pages and page sizes keep the list', async () => {
    const { services: first } = await services.open();

    const second = await services.goToPage(2);
    expect(second.request().postDataJSON().variables).toMatchObject({ page: 2, limit: 10 });
    const onPage2 = (await second.json()).data.extraServices.collection as { id: string }[];
    expect(onPage2.map((service) => service.id)).not.toEqual(first.map((service) => service.id));

    const resized = await services.setPageSize(20);
    expect(resized.request().postDataJSON().variables).toMatchObject({ limit: 20 });
    await expect(services.rows).toHaveCount(20);
  });

  test('the delete question is asked before anything is deleted', async ({ page }) => {
    const mutations = recordMutations(page);
    const { services: listed } = await services.open();

    await services.askToDelete(listed[0].id);
    await expect(services.deleteDialog).toContainText('Are You Sure ? You Want To Delete This Service');
    await services.cancelDelete();

    await expect(services.rows).toHaveCount(10);
    expect(mutations, 'nothing was sent while the question was open').toEqual([]);
  });

  test('the timeline lists what changed', async () => {
    await services.open();

    const audits = await services.openTimeline(knownService.id);

    expect(audits.length).toBeGreaterThan(0);
    await expect(services.timelineDialog).toContainText(`Extra Service ID :${knownService.id}`);
    expect(audits.at(-1)!.newData).toMatchObject({ id: Number(knownService.id) });
    await services.closeTimeline();
  });

  test('the details page shows what the API answered', async ({ page }) => {
    const details = new ExtraServiceDetailsPage(page);

    const service = await details.open(knownService.id);

    expect(service.id).toBe(knownService.id);
    expect(await details.detail('Service ID')).toBe(knownService.id);
    expect(await details.detail('English Description')).toBe(service.enDescription);
    expect(await details.detail('Arabic Description')).toBe(service.arDescription);
    expect(await details.detail('Status')).toBe(service.isActive ? 'Active' : 'Inactive');
    expect(await details.detail('Show')).toBe(service.isDisplayed ? 'Active' : 'Inactive');
    // The card lists no title at all, though the list shows both.
    expect(await details.labels()).toEqual([
      'Service ID',
      'Arabic Description',
      'English Description',
      'Pay Type',
      'Status',
      'Show',
    ]);
  });

  test('the details page names the pay type in words', async ({ page }) => {
    test.fail(true, 'Pay Type shows the API\'s own key — "one_time" instead of "One Time" (the form spells it out)');
    const details = new ExtraServiceDetailsPage(page);

    const service = await details.open(knownService.id);

    expect(service.payType).toBe('one_time');
    expect(await details.detail('Pay Type')).toBe('One Time');
  });
});
