import { expect, type Locator, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { BasePage } from './base.page';

/**
 * The packages page at /cw/dashboard/packages — one card, **Highly
 * requested**, holding a row per featured rental length: how many months it
 * runs for and which partners offer it.
 *
 * A row is read-only until its **pencil** is pressed; then its two selects
 * come alive, the pencil becomes a **check** that saves, and the **Add Row**
 * icon goes away. The icons are `<svg title="Add Row" | "edit" | "Delete
 * Row">`, not buttons.
 */
export class PackagesPage extends BasePage {
  readonly heading = this.byRole('heading', { name: 'Highly requested' }).first();
  readonly addRow = this.page.locator('svg[title="Add Row"]');
  /** The pencil, and the check it becomes while a row is being edited. */
  readonly editRow = this.page.locator('svg[title="edit"]');
  readonly deleteRow = this.page.locator('svg[title="Delete Row"]');
  /** Every select on the page: months and allies, row by row. */
  readonly selects = this.page.locator('input[id^="react-select"]');

  constructor(page: Page) {
    super(page);
  }

  /** Opens the page and returns what `GetHighlyRequestedPackages` answered. */
  async open(): Promise<HighlyRequestedPackage[]> {
    const loaded = this.page.waitForResponse((r) => isOperation(r, 'GetHighlyRequestedPackages'), { timeout: 30_000 });
    await this.page.goto('/cw/dashboard/packages', { waitUntil: 'domcontentloaded' });
    const [packages] = Object.values((await (await loaded).json()).data ?? {}) as HighlyRequestedPackage[][];
    await expect(this.heading).toBeVisible();
    await this.page.waitForLoadState('networkidle');
    return packages ?? [];
  }

  /** How many rows are on the page (two selects each). */
  async rowCount(): Promise<number> {
    return (await this.selects.count()) / 2;
  }

  /** The icons on screen, in order — `["Add Row", "edit", "Delete Row"]` at rest. */
  async icons(): Promise<(string | null)[]> {
    return this.page.locator('svg[title]').evaluateAll((icons) => icons.map((icon) => icon.getAttribute('title')));
  }

  async disabledSelects(): Promise<boolean[]> {
    return this.selects.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).disabled));
  }

  /** The months shown on a row (the select's single value). */
  monthsValue(row = 0): Locator {
    return this.page.locator('[class*="singleValue"]').nth(row);
  }

  /**
   * The partner chips on the page, in order. Pre-prod has a single row, so
   * these are that row's partners.
   */
  async allyChips(): Promise<string[]> {
    const chips = await this.page.locator('[class*="multiValue"]').allInnerTexts();
    return chips.map((chip) => chip.replace(/\s*×\s*$/, '').replace(/\s+/g, ' ').trim());
  }

  /** Puts a row into edit mode; **the check is never pressed by a spec**. */
  async startEditing(row = 0): Promise<void> {
    await this.editRow.nth(row).click();
    await expect.poll(async () => (await this.disabledSelects())[row * 2]).toBe(false);
  }

  /** The options one of the row's selects offers, by its position on the page. */
  async optionsOf(selectIndex: number): Promise<string[]> {
    await this.selects.nth(selectIndex).focus();
    await this.page.keyboard.press('ArrowDown');
    const options = this.page.locator('[id*="-option-"]');
    await expect(options.first()).toBeVisible();
    const names = (await options.allInnerTexts()).map((name) => name.trim());
    await this.page.keyboard.press('Escape');
    return names;
  }

  /**
   * Presses a row's bin **with every mutation held back**, so a saved row is
   * never really deleted, and returns what the page would have sent.
   */
  async pressDelete(row: number): Promise<string[]> {
    const held: string[] = [];
    await this.page.route('**/graphql', async (route) => {
      const body = route.request().postDataJSON();
      if (typeof body?.query === 'string' && body.query.trimStart().startsWith('mutation')) {
        held.push(body.operationName);
        await route.abort();
        return;
      }
      await route.fallback();
    });
    try {
      await this.deleteRow.nth(row).click();
      await this.page.waitForTimeout(3_000);
    } finally {
      await this.page.unroute('**/graphql');
    }
    return held;
  }
}

/** A row of the Highly requested card, as the API answers it. */
export interface HighlyRequestedPackage {
  id: string;
  monthsPackage: number;
  localizedPackage: string;
  allyCompanies: { id: string; enName: string }[];
}
