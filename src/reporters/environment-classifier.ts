import type {
  FullResult,
  Reporter,
  Suite,
  TestCase,
} from '@playwright/test/reporter';

/**
 * Classifies hard failures (unexpected outcomes, after retries) so that
 * failures caused by shared-backend latency during deployment windows are
 * labelled environment-related rather than mistaken for automation defects.
 *
 * The signal is the error signature: timeouts and network errors are the
 * fingerprint of backend degradation, whereas content/logic assertion
 * mismatches point at an automation or product defect worth investigating.
 */

const ENVIRONMENT_ERROR_PATTERN =
  /timeout|timed out|exceeded|net::ERR|NS_ERROR|ECONN|ETIMEDOUT|socket hang up|ERR_CONNECTION|navigation (?:to|failed)|frame was detached|target closed/i;

/**
 * Rate limiting is environment-related too, but it reads as an ordinary timeout
 * once the throttled bundle leaves the page blank, so call it out by name — the
 * fix is to wait, not to look for a broken selector.
 */
const RATE_LIMIT_PATTERN = /rate limit|\b429\b/i;

function projectName(test: TestCase): string {
  let suite: Suite | undefined = test.parent;
  while (suite) {
    if (suite.type === 'project') {
      return suite.title || 'unknown';
    }
    suite = suite.parent;
  }
  return 'unknown';
}

function lastErrorText(test: TestCase): string {
  const lastResult = test.results[test.results.length - 1];
  if (!lastResult) {
    return '';
  }
  const fromErrors = (lastResult.errors ?? [])
    .map((error) => `${error.message ?? ''}\n${error.stack ?? ''}`)
    .join('\n');
  return fromErrors || lastResult.error?.message || '';
}

export default class EnvironmentClassifierReporter implements Reporter {
  private rootSuite: Suite | undefined;

  onBegin(_config: unknown, suite: Suite): void {
    this.rootSuite = suite;
  }

  onEnd(_result: FullResult): void {
    const failures = (this.rootSuite?.allTests() ?? []).filter(
      (test) => test.outcome() === 'unexpected',
    );

    if (failures.length === 0) {
      return;
    }

    let environmentCount = 0;
    let defectCount = 0;
    const lines: string[] = [];

    for (const test of failures) {
      const errorText = lastErrorText(test);
      const isRateLimited = RATE_LIMIT_PATTERN.test(errorText);
      const isEnvironment = isRateLimited || ENVIRONMENT_ERROR_PATTERN.test(errorText);
      if (isEnvironment) {
        environmentCount += 1;
      } else {
        defectCount += 1;
      }

      let label: string;
      if (isRateLimited) {
        label =
          'RATE-LIMITED (the origin refused requests — let the window drain before re-running)';
      } else if (isEnvironment) {
        label =
          'ENVIRONMENT-RELATED (backend latency — verify deploy window via `npm run health`)';
      } else {
        label = 'AUTOMATION/PRODUCT DEFECT (investigate)';
      }
      lines.push(`  • [${projectName(test)}] ${test.title}\n      → ${label}`);
    }

    console.log('\n──── Failure classification ────');
    console.log(lines.join('\n'));
    console.log(
      `\n  ${environmentCount} environment-related, ${defectCount} likely defect(s).`,
    );
    console.log(
      '  Environment-related failures during a deployment window are not automation defects.\n',
    );
  }
}
