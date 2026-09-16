import { expect, type Page } from '@playwright/test';
import { BasePage } from './base.page';

export class SigninPage extends BasePage {
  readonly email = this.page.locator('#email');
  readonly password = this.page.locator('#password');
  readonly loginButton = this.byRole('button', { name: 'Login' });
  /**
   * The dashboard allows one session per account. Signing in while another is
   * live asks whether to log that one out.
   */
  readonly otherSessionDialog = this.byRole('dialog').filter({
    hasText: 'automatically log out your current session on the other device',
  });

  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.page.goto('/signin', { waitUntil: 'domcontentloaded' });
    await expect(this.email).toBeVisible();
  }

  /**
   * Signs in, and only takes over a session that is live elsewhere when told
   * to: confirming logs out whoever is using the account on another device.
   */
  async signIn(email: string, password: string, { takeOverSession = false } = {}): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.loginButton.click();

    const signedIn = this.page.waitForURL((url) => !url.pathname.startsWith('/signin'), { timeout: 30_000 });
    const outcome = await Promise.race([
      signedIn.then(() => 'signed-in' as const, () => 'stuck' as const),
      this.otherSessionDialog.waitFor({ timeout: 30_000 }).then(() => 'other-session' as const, () => 'stuck' as const),
    ]);
    if (outcome === 'signed-in') {
      return;
    }
    if (outcome === 'stuck') {
      const message = await this.page.getByText('please enter valid credentials').isVisible();
      throw new Error(message ? `The dashboard rejected the credentials for ${email}` : `Signing in as ${email} did not complete`);
    }

    if (!takeOverSession) {
      throw new Error(
        `${email} is signed in on another device, and signing in here would log it out. ` +
          'Use an account nobody else is using, or re-run with DASHBOARD_TAKE_OVER_SESSION=1.',
      );
    }
    await this.otherSessionDialog.getByRole('button', { name: 'Confirm' }).click();
    await signedIn;
  }
}
