import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { isOperation } from '../utils/graphql';
import { BasePage } from './base.page';

/**
 * A paginated dashboard list (bookings, customers): one table, a
 * `Total Results` line, MUI pagination and a page-size select, all reloaded by
 * one GraphQL query.
 */
export abstract class ListPage extends BasePage {
  /**
   * The page also holds a hidden ratings table ahead of the list, so the list
   * is picked out by its own header. With no results there is no table at
   * all, only `noRecords`.
   */
  readonly table: Locator;
  readonly rows: Locator;
  readonly noRecords = this.page.getByText('No records found!');
  readonly totalResults = this.page.getByText(/^Total Results: \d+$/);
  readonly pageSizeButton = this.byRole('button', { name: 'Without label' });

  protected constructor(
    page: Page,
    /** A column header only this list has. */
    idHeader: string,
    /** The GraphQL operation that fills the list. */
    protected readonly listQuery: string,
  ) {
    super(page);
    this.table = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: idHeader }) });
    this.rows = this.table.locator('tbody tr');
  }

  async total(): Promise<number> {
    return Number((await this.totalResults.innerText()).match(/\d+/)![0]);
  }

  async goToPage(pageNumber: number): Promise<Response> {
    // Exact: with 2000+ pages, "Go to page 2" also names "Go to page 2001".
    const response = await this.reloadingList(() => this.byRole('button', { name: `Go to page ${pageNumber}`, exact: true }).click());
    await expect(this.byRole('button', { name: `page ${pageNumber}`, exact: true })).toHaveAttribute('aria-current', 'true');
    return response;
  }

  async setPageSize(size: 10 | 25 | 50 | 100): Promise<Response> {
    await this.pageSizeButton.click();
    return this.reloadingList(() => this.byRole('option', { name: String(size), exact: true }).click());
  }

  /**
   * The text of every row's cell under `header`, located by the header's
   * position. Headers are matched on their text content — the page
   * capitalises some on screen (`Rented days` shows as `Rented Days`).
   */
  async column(header: string): Promise<string[]> {
    const headers = await this.headers();
    const index = headers.indexOf(header);
    expect(index, `column "${header}" in ${headers.join(' | ')}`).toBeGreaterThanOrEqual(0);
    return this.rows.evaluateAll(
      (rows, i) => rows.map((row) => (row as HTMLTableRowElement).cells[i]?.innerText.replace(/\s+/g, ' ').trim() ?? ''),
      index,
    );
  }

  /** One row as header → cell text, picked by the text of its `idHeader` cell. */
  async row(idHeader: string, id: string): Promise<Record<string, string>> {
    const headers = await this.headers();
    const ids = await this.column(idHeader);
    const index = ids.indexOf(id);
    expect(index, `${id} among ${ids.join(', ')}`).toBeGreaterThanOrEqual(0);
    const cells = await this.rows
      .nth(index)
      .evaluate((row) => [...(row as HTMLTableRowElement).cells].map((cell) => cell.innerText.replace(/\s+/g, ' ').trim()));
    return Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? '']));
  }

  /** Column headers; some carry trailing spaces in the markup (`Bookings `). */
  private async headers(): Promise<string[]> {
    return (await this.table.locator('thead th').allTextContents()).map((text) => text.trim());
  }

  /**
   * Runs `action` and waits for the list query it triggers, so assertions read
   * the new rows rather than the ones still on screen.
   */
  protected async reloadingList(action: () => Promise<void>): Promise<Response> {
    // Bounded, so an action that never queries (the bookings' Airports filter)
    // fails with a reason instead of running into the test timeout — but long
    // enough for API pacing, which has held a list query over 10s.
    const response = this.page.waitForResponse((r) => isOperation(r, this.listQuery), { timeout: 30_000 });
    await action();
    const answered = await response;
    expect(answered.ok(), `${this.listQuery} answered ${answered.status()}`).toBeTruthy();
    await expect(this.rows.first().or(this.noRecords)).toBeVisible();
    return answered;
  }

  /**
   * Opens the list at `path` and returns its first answer, failing with the
   * API's own words when it refuses — the page would just show no records.
   */
  protected async openAt(path: string): Promise<Response> {
    const listed = this.page.waitForResponse((r) => isOperation(r, this.listQuery), { timeout: 30_000 });
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
    const response = await listed;
    const body = await response.text();
    expect(response.ok() && !body.includes('"errors"'), `${this.listQuery} answered ${response.status()}: ${body.slice(0, 300)}`).toBe(true);
    return response;
  }
}
