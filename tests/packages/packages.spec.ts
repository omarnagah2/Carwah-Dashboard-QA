import { expect, test } from '../../src/fixtures/test';
import { PackagesPage } from '../../src/pages/packages.page';
import { recordMutations } from '../../src/utils/mutations';

/**
 * Read-only. The page's one card decides which rental lengths the customer
 * app features and which partners they lead to, so **no spec presses the
 * check** that saves, and the bin is only ever pressed with every mutation
 * held back (`pressDelete`) — there is no confirmation to stop it otherwise
 * (the known issue below).
 */
test.describe('packages (Highly requested)', () => {
  let packages: PackagesPage;

  test.beforeEach(async ({ page }) => {
    packages = new PackagesPage(page);
  });

  test('shows the featured lengths the API answered', async () => {
    const featured = await packages.open();

    expect(featured.length).toBeGreaterThan(0);
    expect(await packages.rowCount()).toBe(featured.length);
    await expect(packages.monthsValue(0)).toHaveText(String(featured[0].monthsPackage));
    expect(await packages.allyChips()).toEqual(featured[0].allyCompanies.map((ally) => ally.enName));
  });

  test('a row is read-only until the pencil is pressed', async () => {
    await packages.open();

    expect(await packages.icons()).toEqual(['Add Row', 'edit', 'Delete Row']);
    expect(await packages.disabledSelects()).toEqual([true, true]);

    await packages.startEditing(0);

    // Editing takes Add Row away and leaves the check — still titled "edit" —
    // beside a bin that loses its own title while the row is open.
    expect(await packages.disabledSelects()).toEqual([false, false]);
    expect(await packages.icons()).toEqual(['edit']);
  });

  test('the selects offer the lengths still free and every partner', async () => {
    const featured = await packages.open();
    await packages.startEditing(0);

    const months = await packages.optionsOf(0);
    const allies = await packages.optionsOf(1);

    // A length already featured is not offered again.
    expect(months).not.toContain(String(featured[0].monthsPackage));
    expect(months).toEqual(expect.arrayContaining(['2', '3', '12', '24']));
    expect(allies[0]).toBe('all');
    expect(allies.length).toBeGreaterThan(100);
  });

  test('Add Row opens an empty row, and removing it sends nothing', async ({ page }) => {
    const mutations = recordMutations(page);
    const featured = await packages.open();

    await packages.addRow.first().click();

    expect(await packages.rowCount()).toBe(featured.length + 1);
    // The new row is editable; the saved one above it is not.
    expect(await packages.disabledSelects()).toEqual([true, true, false, false]);
    expect(mutations, 'an unsaved row is only on screen').toEqual([]);

    // Its own bin takes it away again, still without a word to the API.
    await packages.deleteRow.last().click();

    await expect.poll(() => packages.rowCount()).toBe(featured.length);
    expect(mutations).toEqual([]);
  });

  test('deleting a featured length asks first', async () => {
    test.fail(
      true,
      'The bin deletes a saved row on the spot: one click sends DeleteHighlyRequestedPackage with no question at all, unlike every other delete in the dashboard',
    );
    await packages.open();

    const held = await packages.pressDelete(0);

    // Nothing should go out before the question is answered.
    expect(held, 'mutations sent by the click').toEqual([]);
  });

  test('the bin does send the delete, once it is pressed', async () => {
    const featured = await packages.open();

    const held = await packages.pressDelete(0);

    // Held back by the spec, so the row is still there afterwards.
    expect(held).toEqual(['DeleteHighlyRequestedPackage']);
    expect(await packages.rowCount()).toBe(featured.length);
  });
});
