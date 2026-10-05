import { expect, test } from '../../src/fixtures/test';
import { testData } from '../../src/config/test-data';
import { ExtraServiceFormPage } from '../../src/pages/extra-service-form.page';
import { recordMutations } from '../../src/utils/mutations';

const { knownService } = testData.extraServices;

/**
 * Read-only: these open the form and read what it offers and when Save is
 * enabled. **Save is never pressed** — a saved service is charged on real
 * bookings — and every spec proves it sent no mutation.
 */
test.describe('the extra service form', () => {
  test('Add opens empty, with Save disabled until it is filled', async ({ page }) => {
    const mutations = recordMutations(page);
    const form = new ExtraServiceFormPage(page);
    await form.openAdd();

    await expect(form.enTitle).toHaveValue('');
    await expect(form.arTitle).toHaveValue('');
    for (const box of [form.active, form.displayed, form.special]) {
      await expect(box).not.toBeChecked();
    }
    await expect(form.saveButton).toBeDisabled();
    expect(await form.payTypes()).toEqual(['Free', 'One Time', 'Daily']);

    await form.enTitle.fill('Never saved');
    await form.arTitle.fill('لا يُحفظ');
    await form.enDescription.fill('A service the automated test only types.');
    await form.arDescription.fill('خدمة يكتبها الاختبار فقط.');
    await form.choosePayType('Free');

    // The images are optional: the form is complete without them.
    await expect(form.saveButton).toBeEnabled();
    expect(mutations).toEqual([]);
  });

  test('Edit is filled from the API, with Save disabled until something changes', async ({ page }) => {
    const mutations = recordMutations(page);
    const form = new ExtraServiceFormPage(page);

    const service = await form.openEdit(knownService.id);

    await expect(form.enTitle).toHaveValue(String(service.enTitle));
    await expect(form.arTitle).toHaveValue(String(service.arTitle));
    await expect(form.enDescription).toHaveValue(String(service.enDescription));
    await expect(form.active).toBeChecked({ checked: Boolean(service.isActive) });
    await expect(form.displayed).toBeChecked({ checked: Boolean(service.isDisplayed) });
    await expect(form.saveButton).toBeDisabled();

    await form.enDescription.fill(`${service.enDescription} `);

    await expect(form.saveButton).toBeEnabled();
    expect(mutations).toEqual([]);
  });

  test('Cancel leaves the form without saving', async ({ page }) => {
    const mutations = recordMutations(page);
    const form = new ExtraServiceFormPage(page);
    await form.openEdit(knownService.id);
    await form.enTitle.fill('Changed but never saved');

    await form.cancelButton.click();

    await expect(page).toHaveURL(/\/cw\/dashboard\/extraservice$/);
    expect(mutations).toEqual([]);
  });
});
