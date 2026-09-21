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
  // Disabled days (past pickups) can carry the same number as the one wanted,
  // and while a month slides in the old and new months are both in the grid,
  // so the click waits for a single match.
  const dayButton = picker
    .locator('button:has(p):not([class*="hidden"]):not([class*="dayDisabled"])')
    .filter({ hasText: new RegExp(`^(${day}|${arabicDay})$`) });
  await expect(dayButton).toHaveCount(1);
  await dayButton.click();
  await picker.getByRole('button', { name: 'OK' }).click();
  await expect(picker).toBeHidden();
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The MUI date picker behind the customer form's dates (expiries, birth). It
 * opens on a year list, then asks for the month, then the day — so any date
 * is three clicks, however far off — and is closed with **Ok**. The field
 * then reads DD-MM-YYYY, and its Hijri twin fills itself in.
 */
export async function pickCalendarDate(page: Page, field: Locator, date: Date): Promise<void> {
  const picker = page.locator('.MuiPickersModal-dialogRoot');
  await field.click();
  await picker.locator('.MuiPickersYear-root', { hasText: new RegExp(`^${date.getFullYear()}$`) }).click();
  await picker.locator('.MuiPickersMonth-root', { hasText: new RegExp(`^${SHORT_MONTHS[date.getMonth()]}$`) }).click();
  await picker
    .locator('button:has(p):not([class*="hidden"])')
    .filter({ hasText: new RegExp(`^${date.getDate()}$`) })
    .click();
  await picker.getByRole('button', { name: 'Ok' }).click();
  await expect(picker).toBeHidden();
  const pad = (n: number) => String(n).padStart(2, '0');
  await expect(field).toHaveValue(`${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`);
}
