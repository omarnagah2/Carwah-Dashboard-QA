import { expect, type Locator, type Page } from '@playwright/test';

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/**
 * The MUI date-time picker behind the read-only booking date fields (Edit
 * Booking, Change Duration). It opens as its own modal,
 * `.MuiPickersModal-dialogRoot`, over whatever dialog holds the field.
 *
 * On the English dashboard these fields and the picker often render in
 * Arabic — month names and digits — so nothing here reads the picker's
 * labels: months are stepped by count with the (always English) arrow buttons,
 * and the day is matched in either digit set. The grid pads with the
 * neighbouring months' days, which carry a `hidden` class and are skipped.
 * The time is left as it was.
 */
export async function pickDate(page: Page, field: Locator, current: Date, date: Date): Promise<void> {
  const picker = page.locator('.MuiPickersModal-dialogRoot');
  await field.click();
  await expect(picker).toBeVisible();
  const months = (date.getFullYear() - current.getFullYear()) * 12 + date.getMonth() - current.getMonth();
  expect(months, 'the new date must not be in an earlier month').toBeGreaterThanOrEqual(0);
  for (let step = 0; step < months; step++) {
    await picker.getByRole('button', { name: 'Next month' }).click();
  }
  const day = String(date.getDate());
  const arabicDay = [...day].map((digit) => ARABIC_DIGITS[Number(digit)]).join('');
  await picker
    .locator('button:has(p):not([class*="hidden"])')
    .filter({ hasText: new RegExp(`^(${day}|${arabicDay})$`) })
    .click();
  await picker.getByRole('button', { name: 'OK' }).click();
  await expect(picker).toBeHidden();
}
