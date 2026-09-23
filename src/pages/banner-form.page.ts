import { expect, type Locator, type Page } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { escapeRegExp } from '../utils/text';
import { BasePage } from './base.page';

/**
 * The banner form, shared by "Add Banner" (/cw/dashboard/banners/add) and
 * "Edit Banner" (/cw/dashboard/banners/<id>/edit): a **DeepLink** checkbox,
 * Sort Order, a Status react-select and the Arabic and English images —
 * and, once DeepLink is ticked, seven more react-selects that say which
 * cars the banner leads to (City, Ally Name, Ally's branches, Car Version,
 * Car Type, Extra Service, service) with Daily Price From / To.
 *
 * **Save is spelled `save`** here, and it is enabled before the form is
 * complete: the images are checked when it is pressed ("this field is
 * required").
 */
export class BannerFormPage extends BasePage {
  readonly deepLink = this.page.locator('input[type="checkbox"]').first();
  readonly sortOrder = this.page.locator('#sortorder');
  /**
   * The two price fields carry no placeholder, only a MUI label — and the
   * markup spells it `Daily price From` while the screen capitalises it, so
   * the match ignores case (as the list headers do).
   */
  readonly dailyPriceFrom = this.priceField('From');
  readonly dailyPriceTo = this.priceField('To');
  readonly saveButton = this.byRole('button', { name: 'save' });
  readonly cancelButton = this.byRole('button', { name: 'Cancel' });
  readonly copyLinkButton = this.page.getByTitle('Copy banner link', { exact: true });
  private readonly dropdowns = this.page.locator('div.dropdown-select');

  constructor(page: Page) {
    super(page);
  }

  async openAdd(): Promise<void> {
    await this.page.goto('/cw/dashboard/banners/add', { waitUntil: 'domcontentloaded' });
    await expect(this.byRole('heading', { name: 'Add Banner' }).first()).toBeVisible({ timeout: 30_000 });
    await expect(this.sortOrder).toBeVisible();
  }

  /** Opens a banner's edit page and returns the `Banner` it loads. */
  async openEdit(bannerId: string): Promise<BannerProfile> {
    const loaded = this.page.waitForResponse((r) => isOperation(r, 'Banner'), { timeout: 30_000 });
    await this.page.goto(`/cw/dashboard/banners/${bannerId}/edit`, { waitUntil: 'domcontentloaded' });
    const [banner] = Object.values((await (await loaded).json()).data ?? {}) as BannerProfile[];
    await expect(this.sortOrder).toHaveValue(String(banner.displayOrder), { timeout: 30_000 });
    await this.page.waitForLoadState('networkidle');
    return banner;
  }

  /** The placeholders of the react-selects on screen, in order. */
  async dropdownLabels(): Promise<string[]> {
    return (await this.dropdowns.allInnerTexts()).map((label) => label.replace(/\s+/g, ' ').trim());
  }

  /** The options of one of them, named by the placeholder it shows. */
  async optionsOf(placeholder: string): Promise<string[]> {
    const dropdown = await this.dropdown(placeholder);
    await dropdown.locator('input').focus();
    await this.page.keyboard.press('ArrowDown');
    const options = this.page.locator('[id*="-option-"]');
    await expect(options.first()).toBeVisible();
    const names = (await options.allInnerTexts()).map((name) => name.trim());
    await this.page.keyboard.press('Escape');
    return names;
  }

  async choose(placeholder: string, option: string): Promise<void> {
    const dropdown = await this.dropdown(placeholder);
    await dropdown.locator('input').focus();
    await this.page.keyboard.press('ArrowDown');
    await this.page
      .locator('[id*="-option-"]')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(option)}\\s*$`) })
      .first()
      .click();
    await this.page.keyboard.press('Escape');
    await expect(dropdown).toContainText(option);
  }

  /** The "this field is required" notes the images show when save is pressed. */
  requiredNotes(): Locator {
    return this.page.getByText('this field is required');
  }

  private priceField(end: 'From' | 'To'): Locator {
    return this.page
      .locator('div.MuiTextField-root')
      // MUI repeats the label inside the outline's legend, so the text is
      // matched loosely rather than anchored.
      .filter({ hasText: new RegExp(`Daily price ${end}`, 'i') })
      .locator('input');
  }

  private async dropdown(placeholder: string): Promise<Locator> {
    const labels = await this.dropdownLabels();
    const index = labels.indexOf(placeholder);
    expect(index, `dropdown "${placeholder}" among ${labels.join(' | ')}`).toBeGreaterThanOrEqual(0);
    return this.dropdowns.nth(index);
  }
}

/** The fields of `Banner` the specs check. */
export interface BannerProfile {
  id: string;
  displayOrder: number;
  imgAr: string;
  imgEn: string;
  isActive: boolean;
  isDeepLink: boolean;
  service: string | null;
  dailyPriceFrom: number | null;
  dailyPriceTo: number | null;
  areaIds: string[];
  allyCompanyIds: string[];
  branchIds: string[];
  carVersionIds: string[];
  vehicleTypeIds: string[];
  extraServiceIds: string[];
}
