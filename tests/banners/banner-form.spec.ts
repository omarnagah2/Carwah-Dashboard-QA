import { expect, test } from '../../src/fixtures/test';
import { testData } from '../../src/config/test-data';
import { BannerFormPage } from '../../src/pages/banner-form.page';
import { BannersPage } from '../../src/pages/banners.page';
import { recordMutations } from '../../src/utils/mutations';

const { knownBanner } = testData.banners;

/**
 * Read-only: the form is opened and read, and **save is only pressed where
 * the page refuses it** — on an Add form with no images, which sends
 * nothing. A saved banner would show up in the customer app, so no spec
 * completes one.
 */
test.describe('the banner form', () => {
  test('Add opens with the deep-link fields hidden', async ({ page }) => {
    const mutations = recordMutations(page);
    const form = new BannerFormPage(page);
    await form.openAdd();

    await expect(form.deepLink).not.toBeChecked();
    await expect(form.sortOrder).toHaveValue('');
    expect(await form.dropdownLabels()).toEqual(['Status']);
    expect(await form.optionsOf('Status')).toEqual(['Active', 'Inactive']);

    await form.deepLink.check();

    // Ticking it opens the targeting fields: where the banner leads.
    expect(await form.dropdownLabels()).toEqual([
      'Status',
      'City',
      "Ally Name",
      "Ally's branches",
      'Car Version',
      'Car Type',
      'Extra Service',
    ]);
    await expect(form.dailyPriceFrom).toBeVisible();
    await expect(form.dailyPriceTo).toBeVisible();
    expect(mutations).toEqual([]);
  });

  test('a banner without images is refused, and nothing is sent', async ({ page }) => {
    const mutations = recordMutations(page);
    const form = new BannerFormPage(page);
    await form.openAdd();
    await form.sortOrder.fill('99');

    // Save is offered before the form is complete; the images are checked
    // when it is pressed.
    await expect(form.saveButton).toBeEnabled();
    await form.saveButton.click();

    await expect(form.requiredNotes()).toHaveCount(2);
    await expect(page).toHaveURL(/\/cw\/dashboard\/banners\/add$/);
    expect(mutations, 'an incomplete banner is never sent').toEqual([]);
  });

  test('Edit is filled from the API, with save disabled until something changes', async ({ page }) => {
    const mutations = recordMutations(page);
    const form = new BannerFormPage(page);

    const banner = await form.openEdit(knownBanner.id);

    await expect(form.sortOrder).toHaveValue(String(banner.displayOrder));
    await expect(form.deepLink).toBeChecked({ checked: banner.isDeepLink });
    await expect(form.saveButton).toBeDisabled();

    await form.sortOrder.fill(String(banner.displayOrder + 1));

    await expect(form.saveButton).toBeEnabled();
    expect(mutations).toEqual([]);
  });

  test('Cancel leaves the form without saving', async ({ page }) => {
    const mutations = recordMutations(page);
    const form = new BannerFormPage(page);
    // Cancel goes back in history (as on the car form), so the form is
    // reached the way a user reaches it — from the list.
    const banners = new BannersPage(page);
    const { banners: listed } = await banners.open();
    await banners.action(listed[0].id, 'Edit').click();
    await expect(form.sortOrder).toBeVisible();
    await form.sortOrder.fill('98');

    await form.cancelButton.click();

    await expect(page).toHaveURL(/\/cw\/dashboard\/banners$/);
    await expect(banners.rows.first()).toBeVisible();
    expect(mutations).toEqual([]);
  });
});
