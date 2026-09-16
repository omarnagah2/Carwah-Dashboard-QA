import { expect, test } from '@playwright/test';

test('a signed-in admin is not sent back to sign in', async ({ page }) => {
  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });

  expect(response?.status()).toBeLessThan(400);
  await expect(page).not.toHaveURL(/\/signin/);
});
