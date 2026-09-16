import type { BrowserContext } from '@playwright/test';
import { testData } from '../config/test-data';

/**
 * The GraphQL API rate-limits: past a burst it answers
 * `429 {"message":"Too Many Requests"}`. A booking page fires ~15 queries on
 * load, so once the bundle came from disk and pages loaded in a second, the
 * filter specs tripped it — the list rendered "No records found!" and the spec
 * failed on a missing row, far from the cause.
 *
 * A throttled request cannot simply be sent again: every request carries a
 * nonce, and the API answers a repeat with `400 Duplicated: nonce`, even when
 * the first attempt was turned away. So requests are paced before they leave
 * instead — held back, unchanged, while the last window is full. Before the
 * bundle was cached the suite ran at roughly this rate and never saw a 429.
 */
const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = Number(process.env.API_REQUESTS_PER_10S ?? 20);

/** Send times of recent requests, shared by every context in the worker. */
const sent: number[] = [];

async function takeSlot(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (sent.length && now - sent[0] >= WINDOW_MS) {
      sent.shift();
    }
    if (sent.length < MAX_PER_WINDOW) {
      sent.push(now);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, WINDOW_MS - (now - sent[0]) + 50));
  }
}

/**
 * Keeps the dashboard's API calls under the rate limit, and logs any call the
 * API refuses — the page swallows those and just renders nothing.
 */
export async function paceApiCalls(context: BrowserContext): Promise<void> {
  await context.route(testData.apiUrl, async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const queued = Date.now();
      await takeSlot();
      const waited = Date.now() - queued;
      // A page load is often held a few seconds; only a long wait is news.
      if (waited > 10_000) {
        console.log(`[api] held ${operationOf(request.postData())} for ${Math.round(waited / 1_000)}s`);
      }
    }
    await route.continue();
  });
  context.on('response', async (response) => {
    if (response.url() !== testData.apiUrl || response.ok()) {
      return;
    }
    const body = await response.text().catch(() => '');
    console.log(`[api] ${operationOf(response.request().postData())} answered ${response.status()}: ${body.slice(0, 200)}`);
  });
}

function operationOf(postData: string | null): string {
  try {
    return JSON.parse(postData ?? '{}').operationName ?? 'request';
  } catch {
    return 'request';
  }
}
