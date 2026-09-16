import { existsSync } from 'node:fs';
import { prepareContext, test as setup } from '../src/fixtures/test';
import { authFile } from '../src/config/auth';
import { testData } from '../src/config/test-data';
import { SigninPage } from '../src/pages/signin.page';

/**
 * The dashboard keeps one session per account, so every fresh sign-in risks
 * logging someone else out. Reuse the stored session while the server still
 * accepts it, and sign in only when it does not.
 */
setup('sign in as admin', async ({ browser, page }) => {
  const { email, password } = testData.admin;

  if (!process.env.FORCE_LOGIN && existsSync(authFile)) {
    const stored = await browser.newContext({ storageState: authFile, baseURL: testData.baseUrl });
    await prepareContext(stored);
    const probe = await stored.newPage();
    await probe.goto('/cw/dashboard/Statistics', { waitUntil: 'domcontentloaded' });
    // A rejected session is redirected to /signin once the app has checked it.
    const stillValid = await probe
      .waitForURL((url) => url.pathname.startsWith('/signin'), { timeout: 5_000 })
      .then(() => false, () => true);
    await stored.close();
    if (stillValid) {
      console.log(`Reusing the stored session for ${email}`);
      return;
    }
    console.log('The stored session was rejected — signing in again');
  }

  if (!email || !password) {
    throw new Error('Set DASHBOARD_ADMIN_EMAIL and DASHBOARD_ADMIN_PASSWORD (see .env.example)');
  }

  const signin = new SigninPage(page);
  await signin.open();
  await signin.signIn(email, password, { takeOverSession: !!process.env.DASHBOARD_TAKE_OVER_SESSION });

  console.log(`Signed in as ${email}, landed on ${page.url()}`);
  await page.context().storageState({ path: authFile });
});
