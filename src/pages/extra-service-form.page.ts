import { expect, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { escapeRegExp } from '../utils/text';
import { BasePage } from './base.page';

export type PayType = 'Free' | 'One Time' | 'Daily';

/**
 * The extra service form, shared by "Add Extra Service"
 * (/cw/dashboard/extraservice/add) and "Edit Extra Service"
 * (/cw/dashboard/extraservice/<id>/edit): the two titles, the two
 * descriptions, the Active / Show / Show On Main Page checkboxes, a Pay Type
 * react-select, two optional images, Save and Cancel. **Save is disabled**
 * until the form is filled (add) or something changes (edit).
 */
export class ExtraServiceFormPage extends BasePage {
  readonly enTitle = this.page.locator('#enTitle');
  readonly arTitle = this.page.locator('#arTitle');
  readonly enDescription = this.page.locator('textarea[name="enDescription"]');
  readonly arDescription = this.page.locator('textarea[name="arDescription"]');
  readonly active = this.page.locator('input[name="isActive"]');
  /** "Show" — the service is offered. */
  readonly displayed = this.page.locator('input[name="isDisplayed"]');
  /** "Show On Main Page". */
  readonly special = this.page.locator('input[name="isSpecial"]');
  readonly saveButton = this.byRole('button', { name: 'Save' });
  readonly cancelButton = this.byRole('button', { name: 'Cancel' });
  private readonly payTypeSelect = this.page.locator('div.dropdown-select').first();

  constructor(page: Page) {
    super(page);
  }

  async openAdd(): Promise<void> {
    await this.page.goto('/cw/dashboard/extraservice/add', { waitUntil: 'domcontentloaded' });
    await expect(this.byRole('heading', { name: 'Add Extra Service' }).first()).toBeVisible({ timeout: 30_000 });
    await expect(this.enTitle).toBeVisible();
  }

  /** Opens a service's edit page and returns the `ExtraService` it loads. */
  async openEdit(serviceId: string): Promise<Record<string, unknown>> {
    const loaded = this.page.waitForResponse((r) => isOperation(r, 'ExtraService'), { timeout: 30_000 });
    await this.page.goto(`/cw/dashboard/extraservice/${serviceId}/edit`, { waitUntil: 'domcontentloaded' });
    const [service] = Object.values((await (await loaded).json()).data ?? {}) as Record<string, unknown>[];
    await expect(this.enTitle).toHaveValue(String(service.enTitle), { timeout: 30_000 });
    await this.page.waitForLoadState('networkidle');
    return service;
  }

  /** The Pay Type options: Free, One Time, Daily. */
  async payTypes(): Promise<string[]> {
    await this.payTypeSelect.locator('input').focus();
    await this.page.keyboard.press('ArrowDown');
    const options = this.page.locator('[id*="-option-"]');
    await expect(options.first()).toBeVisible();
    const names = (await options.allInnerTexts()).map((name) => name.trim());
    await this.page.keyboard.press('Escape');
    return names;
  }

  async choosePayType(payType: PayType): Promise<void> {
    await this.payTypeSelect.locator('input').focus();
    await this.page.keyboard.press('ArrowDown');
    await this.page
      .locator('[id*="-option-"]')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(payType)}\\s*$`) })
      .first()
      .click();
    await expect(this.payTypeSelect).toContainText(payType);
  }

  /**
   * Presses Save and returns the mutation it sent, read **through a route**
   * so the body survives the navigation that follows a save.
   */
  async save(operation: 'CreateExtraService' | 'UpdateExtraService'): Promise<{ sent: Record<string, unknown>; answer: Record<string, unknown> }> {
    let sent: Record<string, unknown> | undefined;
    let body: { data?: Record<string, unknown>; errors?: unknown[] } | undefined;
    await this.page.route('**/graphql', async (route) => {
      const request = route.request().postDataJSON();
      if (request?.operationName !== operation) {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      body = await response.json();
      sent = request.variables;
      await route.fulfill({ response, json: body });
    });
    try {
      await this.saveButton.click();
      await expect.poll(() => body, { message: `${operation} was never sent`, timeout: 30_000 }).toBeDefined();
    } finally {
      await this.page.unroute('**/graphql');
    }
    const [answer] = Object.values(body!.data ?? {}) as Record<string, unknown>[];
    expect(body!.errors ?? answer?.errors ?? [], `${operation} answered ${JSON.stringify(body).slice(0, 400)}`).toEqual([]);
    return { sent: sent!, answer };
  }
}
