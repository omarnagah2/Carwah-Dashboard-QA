import type { Page } from '@playwright/test';

/**
 * Collects the name of every GraphQL mutation the page sends from now on, so
 * a read-only spec can prove it wrote nothing.
 */
export function recordMutations(page: Page): string[] {
  const mutations: string[] = [];
  page.on('request', (request) => {
    const body = request.url().includes('/graphql') ? request.postDataJSON() : null;
    if (typeof body?.query === 'string' && body.query.trimStart().startsWith('mutation')) {
      mutations.push(body.operationName);
    }
  });
  return mutations;
}
