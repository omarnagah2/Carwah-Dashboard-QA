import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BrowserContext } from '@playwright/test';
import { testData } from '../config/test-data';

/**
 * The dashboard is a create-react-app build: its code is served from
 * content-hashed URLs under `/static/` (`/static/js/29.18c8dfdb.chunk.js`), so
 * a given path always holds the same bytes and a cached copy is never stale.
 *
 * Every test gets a fresh browser context, and so an empty HTTP cache, which
 * means every page load pulled ~8.6 MB of script again — one vendor chunk
 * alone is 7 MB. When pre-prod's throughput dipped, that chunk did not finish
 * inside the navigation timeout and `page.goto` failed before the page
 * existed. Served from disk, it cannot.
 *
 * Deleting the directory is always safe; `npm run clean:cache` does it.
 */
const CACHE_DIR = path.join(process.cwd(), '.cache', 'static');

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

/** Hashed names are unique on their own, so the cache can be a flat directory. */
function cacheFileFor(pathname: string): string {
  return path.join(CACHE_DIR, pathname.replace(/[^\w.-]/g, '_'));
}

/** Serves the dashboard's own hashed scripts and styles from disk once fetched. */
export async function cacheStaticAssets(context: BrowserContext): Promise<void> {
  await context.route(`${new URL(testData.baseUrl).origin}/static/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const contentType = CONTENT_TYPES[path.extname(pathname)];
    if (!contentType) {
      return route.continue();
    }

    const cacheFile = cacheFileFor(pathname);
    if (existsSync(cacheFile)) {
      return route.fulfill({ body: readFileSync(cacheFile), contentType });
    }

    const response = await route.fetch({ timeout: 120_000 });
    if (response.ok()) {
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(cacheFile, await response.body());
    }
    return route.fulfill({ response });
  });
}
