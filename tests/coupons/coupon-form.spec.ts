import { expect, test } from '../../src/fixtures/test';
import { CouponFormPage } from '../../src/pages/coupon-form.page';
import { pickCalendarDate } from '../../src/pages/date-time-picker.component';

/**
 * Read-only: these open "Create Coupon" and look at what the form lets a user
 * choose. **Nothing is ever saved here** — Save is only read, never pressed,
 * because a coupon cannot be deleted. The dates the form accepts are checked
 * as they should behave, so both are `test.fail` today.
 */
test.describe('the coupon form', () => {
  let form: CouponFormPage;

  test.beforeEach(async ({ page }) => {
    form = new CouponFormPage(page);
    await form.openAdd();
  });

  test('the start date cannot be in the past', async ({ page }) => {
    test.fail(true, 'The picker lists 1900–2100 with nothing disabled, so a start date in the past can be chosen — and saving it then breaks the API without a word');
    await form.startDate.click();
    const picker = page.locator('.MuiPickersModal-dialogRoot');
    const today = new Date();
    await picker.locator('.MuiPickersYear-root', { hasText: new RegExp(`^${today.getFullYear()}$`) }).click();
    await picker.locator('.MuiPickersMonth-root').nth(today.getMonth()).click();

    const days = await picker.locator('button:has(p):not([class*="hidden"])').evaluateAll((buttons) =>
      buttons.map((button) => ({ day: Number(button.textContent?.trim()), disabled: (button as HTMLButtonElement).disabled })),
    );

    const past = days.filter((day) => day.day < today.getDate());
    expect(past.length, 'days before today in this month').toBeGreaterThan(0);
    expect(past.filter((day) => !day.disabled).map((day) => day.day), 'past days still offered').toEqual([]);
  });

  test('the end date cannot come before the start date', async ({ page }) => {
    test.fail(true, 'The form takes an end date before the start (02-10 → 25-09) with Save enabled and no complaint; the end picker disables nothing either');
    const today = new Date();
    await form.code.fill(`never-saved-${String(Date.now()).slice(-6)}`);
    await form.choose('Type', 'Percentage');
    await form.discountValue.fill('10');
    await pickCalendarDate(page, form.startDate, new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10));
    await pickCalendarDate(page, form.endDate, new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3));
    await form.numOfUsages.fill('1');
    await form.numOfUsagesPerUser.fill('1');
    await form.minRentPrice.fill('0');

    // Save is never pressed — a coupon cannot be deleted. A form holding a
    // backwards pair of dates should not offer it at all.
    await expect(form.saveButton).toBeDisabled();
  });
});
