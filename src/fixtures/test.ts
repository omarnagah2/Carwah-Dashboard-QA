import { test as base, type BrowserContext } from '@playwright/test';
import { paceApiCalls } from '../utils/api-throttle';
import { cacheStaticAssets } from '../utils/static-cache';

/** What every browser context the suite opens gets. */
export async function prepareContext(context: BrowserContext): Promise<void> {
  await cacheStaticAssets(context);
  await paceApiCalls(context);
}

/**
 * The `test` every spec uses: Playwright's, with the dashboard's static
 * bundle served from disk and its API calls paced under the rate limit.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await prepareContext(context);
    await use(context);
  },
});

export { expect } from '@playwright/test';
