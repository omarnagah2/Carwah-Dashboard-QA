# Carwah Dashboard Playwright Automation

Playwright + TypeScript automation for the Carwah Dashboard
(`http://pre_dashboard.carwah.co:8880`), using the Page Object Model. Sister
project of **Carwah UI**, which covers the customer website; it follows the same
conventions.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env   # then fill in the admin credentials
```

Quote any `.env` value that contains `#`, or everything after it is dropped.

## Run Tests

```bash
npm test
npm run test:headed
npm run test:ui
SLOW_MO=300 npx playwright test --headed
```

The admin signs in once per run (the `setup` project); every spec reuses that
session from `playwright/.auth/admin.json`.

## Layout

```text
tests/
├── auth.setup.ts   admin sign-in
└── smoke/          dashboard-reachable
src/pages/          page objects
src/config/         test-data.ts (all data, env-overridable), auth.ts
src/reporters/      environment-classifier (environment vs defect failures)
```
