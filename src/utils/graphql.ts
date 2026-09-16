import type { Response } from '@playwright/test';

/** Whether `response` answers the GraphQL operation named `operationName`. */
export function isOperation(response: Response, operationName: string): boolean {
  if (!response.url().includes('/graphql')) {
    return false;
  }
  try {
    return response.request().postDataJSON()?.operationName === operationName;
  } catch {
    return false;
  }
}
