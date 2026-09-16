# Carwah Dashboard — Playwright automation

E2E suite for the **Carwah Dashboard** (the admin side) at
**http://pre_dashboard.carwah.co:8880** (HTTP, English by default). Playwright +
TypeScript, Page Object Model. Sister project of `../Carwah UI`, which tests the
customer website — follow its conventions (see its CLAUDE.md) unless the
dashboard gives a reason not to.

## Layout

```
tests/
├── auth.setup.ts   # admin sign-in, once per run; every spec reuses it
├── smoke/          dashboard-reachable
└── bookings/       bookings-list, bookings-filters (read-only),
                    booking-lifecycle (writes: one booking per run, closed at the end)
src/pages/     page objects (BasePage copied from Carwah UI), signin,
               bookings (list), booking-filters (panel), booking-details,
               add-booking
src/utils/     graphql.ts (isOperation)
src/config/    test-data.ts (all data, env-overridable), auth.ts
src/reporters/ environment-classifier (copied from Carwah UI)
```

## Commands

```bash
npx playwright test
npm run typecheck
```

## Environment facts

- **Credentials come from `.env`** (git-ignored; template in `.env.example`),
  loaded by `process.loadEnvFile()` in the config. Never put them in code or docs.
- **`#` starts a comment in `.env`** — the admin password contains one, so the
  value must be quoted. Unquoted, the password is silently truncated and the
  sign-in page answers `please enter valid credentials`.
- **Sign-in is email + password**, no OTP: `#email`, `#password`, the `Login`
  button. A signed-in admin lands on `/cw/dashboard/Statistics`; a signed-out one
  is redirected to `/signin?from=…`. There is also a separate
  "Login as Agency?" flow (`/signin#agency`), not covered yet.
- **One live session per account.** Signing in while the account is signed in
  elsewhere opens a dialog ("…will automatically log out your current session on
  the other device"), and anyone signing in later silently invalidates *our*
  session — the stored one is then redirected to `/signin#Auth` although its
  `expiresAt` is still in the future. So setup reuses the stored session while
  the server accepts it (`FORCE_LOGIN=1` skips that), and on the dialog it
  **stops** rather than logging someone out, unless
  `DASHBOARD_TAKE_OVER_SESSION=1`. `super5@carwah.co` is shared, which is why
  this bites: the suite needs an admin account nobody else uses.
- **The session is in localStorage** (`user_data`, `state`), no cookies and no
  sessionStorage, so a plain `storageState` (`playwright/.auth/admin.json`) is
  enough — unlike Carwah UI, no session re-seeding fixture is needed.

## Bookings (/cw/dashboard/bookings)

- **The list and filter specs are read-only.** Pre-prod bookings are shared and
  change while a run is going (new ones arrive every few minutes), so nothing
  pins a booking or compares exact counts across two reads. Only
  `booking-lifecycle.spec.ts` writes (see below).
- **Two tables are on the page**: a hidden ratings table comes first, so the
  bookings table is the one with a `Booking ID` column header.
- **Columns are found by header**, not index (`BookingsPage.column`) — there
  are 19 of them and positions are easy to miscount.
- **Status tabs are named `<count> <status>`** and several share a prefix
  (Pending / Pending Extend / Pending Review), so the name is anchored. The
  selected tab and page are kept in the URL
  (`?{"status":"pending",...}#page=2`).
- **Every list change is a `GetBookingsQuery`** on
  `prebeta.carwah.co:2052/graphql`; `reloadingList` waits for it so assertions
  read the new rows, not the old ones.
- Page sizes are 10 / 25 / 50 / 100, on an unlabelled MUI select
  (`button "Without label"`).
- **Columns are matched on header text content**, not `innerText`: the page
  capitalises some on screen (`Rented days` shows as `Rented Days`).
- **With no results there is no table at all**, only `No records found!` and
  `Total Results: 0`.
- **Details page**: each fact is an `li.list_item_info` holding a label span and
  a value span with no space between them (`Booking StatusPending`), so values
  are read from the second span. Several labels repeat across sections.
- Other actions on the details page — Edit, Assign To (lists customer care
  users), Add Note, Update Extra Service, Change Duration, Update Price, Add
  Extra Fees, Recall Gateway — are untested. Timeline is read-only.

## Booking lifecycle (`booking-lifecycle.spec.ts`)

### Creating (`AddBookingPage`)

- **This spec writes to pre-prod: every run creates one real booking** for the
  dedicated test customer `591593593` (Omar Nagah) — never Carwah UI's
  `534271861` — at Hegazy Cars / Hegazy Riyadh, Suzuki Dzire 2021 at 99/day,
  cash, the form's default three days from now (all in `testData.newBooking`),
  then walks it Pending → Confirmed → Car Received → Invoiced → Closed. The
  steps are **serial and never retried** (a retry would book again). The id is
  printed and added as a `created booking` annotation.
- **A run that fails midway leaves its booking in that status.** That does not
  block the next run — the super admin may book while one is pending, and the
  car stays offered — but close it by hand (or with `changeStatus('Closed')`)
  so test bookings do not pile up.
- The flow: `/cw/dashboard/bookings/add` → mobile into an intl-tel-input that
  opens as `+966` (press End, then type the local number) → `Customer Data`
  (`GetUsers`) → Pickup City (MUI autocomplete) → company, branch, car:
  react-selects under headings spelled **"Selceting a company/branch"** and
  "select car", each loading after the previous one. Their placeholder covers
  the input, so it is focused, not clicked. Only ten companies are listed, so
  the ally is typed.
- **Car options repeat**: one branch lists the same model at several prices,
  so a car is matched by name *and* `[Daily: N`. Their text content has double
  spaces and a line break the screen hides (`Dzire -  - 2021 |…\n [Daily: 99`).
- Choosing a car shows Extra Services, a coupon box, insurance, the **About
  price** summary (price per day, total days, VAT 15%, Due Amount) and the
  payment method (Cash by default). **Rent** sends `CreateBooking`
  (`data.createRental.{errors, rental}`) and returns straight to the bookings
  list — no confirmation step, no toast.
- The spec checks the price summary, the API's answer, the list row (searched
  by the new id) and the details page.

### Changing status (`BookingDetailsPage.changeStatus`)

- The **Change Status** dialog lists the statuses as MUI radios with no
  accessible name, so a status is taken by its row's text. The list fills in
  after `GetStatus` answers — **Confirmed appears a beat later** than the rest.
  The first row, disabled, always reads Pending, even for a confirmed booking.
- Each choice sends its own mutation, answered as `{ errors, status: 'success' }`:

  | Status | Mutation | Extra steps |
  |---|---|---|
  | Confirmed | `AcceptRent` | — |
  | Car Received | `CarRecieved` (sic) | — |
  | Invoiced | `AllyReceiveCar` | `#grandTotal` (starts at 0; the image is optional), then "Are you sure you want to invoice…" → Confirm. SubStatus becomes *Pending review* |
  | Closed | `CloseRental` | "Booking Close Reasons": *The customer has debts from ally* or *Other:* (id 997) plus a note. The spec always closes with Other and a note saying the automated test did it |

- The close reasons are radios that ignore `check()` — click the label.
- **Closed is final**: the Change Status button disappears.
- **Wait for the booking before acting.** Pressing Change before the details
  have loaded sends `CancelledReasons` without `status`; the API rejects it
  (`Variable "$status" … was not provided`) and the reasons dialog opens
  empty. `expectLoaded` waits for the Booking Status value for that reason.

## Booking filters (`BookingFilters`, `bookings-filters.spec.ts`)

- **Every filter in the panel is covered.** Each spec checks the
  `GetBookingsQuery` variables, then the results as far as anything shows them:
  - on the list — customer, ally, branch, status, payment method, make, city
    (inside the pickup cell), pickup/dropoff date;
  - in the API's rows (`applyFilters` returns them) — rent type
    (`isRentToOwn`), sub-status (`subStatus`);
  - on the first result's details page — national ID, mobile;
  - nowhere — source, payment brand, train station, plate number: only that
    the total narrows without emptying. Their values are pinned in
    `testData.bookingFilters`.
- Search sends: `customerName`, `userNid`, `plateNo`, `customerMobile`
  (`966` + the typed local number), `allyCompanyId: [id]`, `branchIds: [id]`,
  `status: ['cancelled']`, `subStatus: ['late_confirmation']`,
  `paymentMethod: ['CASH']`, `paymentBrand: ['TABBY']`, `makeName: [..]`,
  `cityName: [..]`, `rentType: ['RENT_TO_OWN']`, `source: [..]`,
  `trainStationIds: [id]`, `pickUpDate` / `dropOffDate: 'DD/MM/YYYY'`.
  The chosen filters are also written into the page URL as JSON.
- Text fields have ids (`#customerName`, `#userNid`, `#bookingNo`,
  `#plateNo`). The rest are **react-selects** (`div.dropdown-select`) with
  generated ids and no labels; the placeholder vanishes once a value is
  chosen, so a dropdown is found by its index while it still shows the
  placeholder. Options are `[id*="-option-"]`, and every list starts with a
  disabled `Enter at least 4 characters to search` hint — match options
  exactly. Typing narrows a list; for **Ally Name** it is what searches the
  server (only ten allies are listed up front). Ally Name and branches are
  multi-selects and stay open after a choice.
- **branches** only lists after 4 typed characters, so the branch is typed —
  taken from the first row, whose names are at least that long today.
- **Agency Name appears twice** in the panel; `choose` takes an `occurrence`.
  Both are bound to the same value.
- `reloadingList` waits at most 15s for the query, so a filter that never
  queries fails with that reason instead of the test timeout.
- **Dates** use react-modern-calendar-datepicker, opening on the current month.
  Its grid holds hidden neighbouring months too, so a day is taken by its full
  `aria-label` (`Thursday, 15 October 2026`) and must be visible — a bare `15`
  picked next month's. The pickup-date spec therefore picks a date from the
  list that falls in the current month, and skips if there is none.
- Make and city are pinned in `testData.bookingFilters` (the list shows a car's
  display name, not its make, and a city only inside the pickup cell); ally and
  customer are taken from the list's first row.
- **Clear** empties every field, restores placeholders and reloads the full list.

## Known product issues (report, don't work around)

Specs for these are written as the feature should behave and marked
`test.fail(true, reason)`, so the suite stays green and Playwright reports the
moment one starts passing — then drop the mark.

- **The Airports filter does nothing.** Choosing an airport and pressing
  Search Filter sends no `GetBookingsQuery` at all; the list stays unfiltered.
- **Closing too quickly offers no reasons.** If Change is pressed before the
  booking has loaded, `CancelledReasons` goes out without `status`, fails,
  and the close dialog shows an empty reason list with an enabled
  Close Booking button. Specs avoid it by waiting; a fast user would not.
- **The Agency Name filter is ignored.** The choice is written into the page URL
  (`agency: [{ id: "199", ... }]`) but not into `GetBookingsQuery`'s variables,
  so the total is unchanged. The field is also shown twice.

## Working style

Explore the live dashboard and confirm selectors before writing a test; report
what blocks rather than adding workarounds; when something fails, capture
evidence (URL, dialogs, network payloads) before theorising.
