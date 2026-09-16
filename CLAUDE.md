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
               booking-form (shared price summary), add-booking, edit-booking,
               date-time-picker (the MUI picker behind every booking date field)
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
- **The Booking No./ID search matches parts** of ids and booking numbers:
  `21597` also finds booking 8113, numbered `E21597`. Never assume one row —
  `listedBooking(id)` picks a booking out of the results by id.
- **With no results there is no table at all**, only `No records found!` and
  `Total Results: 0`.
- **Details page**: each fact is an `li.list_item_info` holding a label span and
  a value span with no space between them (`Booking StatusPending`), so values
  are read from the second span. Several labels repeat across sections.
- **The action bar depends on the status**, and before the booking loads it
  shows a default set (with Add Note etc.) that is then replaced — read it
  only after `expectLoaded`. Loaded, it offers:
  - Pending, Confirmed: Change Status, Edit, Print, Timeline, Assign To;
  - Car Received, Invoiced: Change Status, Add Note, Update Extra Service,
    Change Duration, Update Price, Add Extra Fees, Print, Timeline, Extension
    Requests, Assign To;
  - Closed: the same without Change Status.
- Untested so far: Update Price, Add
  Extra Fees, Extension Requests, Recall Gateway, Print.

## Booking lifecycle (`booking-lifecycle.spec.ts`)

### Creating (`AddBookingPage`)

- **This spec writes to pre-prod: every run creates one real booking** for the
  dedicated test customer `591593593` (Omar Nagah) — never Carwah UI's
  `534271861` — at Hegazy Cars / Hegazy Riyadh, Suzuki Dzire 2021 at 99/day,
  cash, the form's default three days from now (all in `testData.newBooking`),
  assigns it to customer care, extends it by a day, confirms it, hands the
  car over, adds a note and extra services, lengthens it by another day,
  invoices and closes it. The
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

### Assigning (`BookingDetailsPage.assignTo`)

- **Assign To** opens "Customer Care List": radios named by user (26 today,
  some names repeated — e.g. two *Asmaa Ibrahim*), so pass a unique name. The
  spec only ever assigns to `testData.newBooking.assignee`, **Omar Nagah**
  (user 1146), the suite's owner, so nothing lands on someone else's queue.
- Its Assign To button is enabled before anyone is chosen; the spec always
  chooses first and has not tried submitting empty.
- Then a SweetAlert (`.swal-modal`, not a MUI dialog): "Are You Sure ? You
  Want To Assign this Booking To <name>" → **Yes** sends
  `AssignRentalTo { rentalId, userId }` and toasts "Booking Assigned
  Successfully".
- The assignee then shows as **bare text after the Assign To button** on the
  details page (nothing there when unassigned), pre-checked when the dialog
  reopens, and in the list's Assign cell as `Assign To <name>`.
- Assign To stays available on a closed booking.

### Editing (`EditBookingPage`)

- **Edit** (details page, until the booking is closed) opens
  `/bookings/<id>/edit`: the Add Booking form filled with the booking, plus
  status buttons at the top, a **Note** and **Save**. The spec moves the
  drop-off a day later and writes a note; the summary reprices at once
  (`GetRentPrice`: 4 days → 396, VAT 59.4, due 455.4). Invoicing then uses
  the new total.
- **Save** sends `EditBooking` (`data.editRental.{errors, rental}`, with
  `notes`) and stays on the edit page. The details page shows the new return
  date, days and totals; the **Timeline**'s newest entry lists old and new
  data (`dropoff Date : …`, `notes : …`, `total_booking_price : …`) —
  `latestChange()` reads it. The drop-off time loses its seconds on save.
- The date fields are read-only and open a **MUI date-time picker** —
  `pickDate` in `date-time-picker.component.ts`, shared with Change Duration
  (`.MuiPickersModal-dialogRoot`; `getByRole('dialog')` finds two nodes). Its
  grid pads with neighbouring months' days, classed `hidden`. While it is
  open the page behind is aria-hidden, so read the field before opening it.
- **Reached through the Edit button, the dates and the picker are in Arabic**
  (`سبتمبر ١٩ ٢١:٢٩`, Arabic month and day names) on the English dashboard;
  opened by URL they are English. So `setDropoffDate` reads no labels: it
  steps months by count with the English arrow buttons and matches the day in
  either digit set.

### Notes (`BookingDetailsPage.addNote`, `rentalNotes`)

- **Add Note** is only offered from Car Received on (see the action bar
  above), so the spec notes the booking after the handover. Its dialog is one
  textbox; **Add** is disabled until something is typed, and sends
  `CustomerUpdateRentalNote { rentalId, note }`, answered with the rental's
  whole note list; the toast says "note added successfully".
- The **Rental Notes** card lists every note, oldest first, as
  `<note> <status>` — the booking's status when it was written
  (`pending`, `car_received`, `closed`). Notes saved from Edit Booking are
  listed too. `created_by`/`created_at` come with the API but are not shown.
  The notes arrive with `GetRentalDetailsQuery`, so they are there once the
  page has loaded.
- Find the card by `booking-details-card`: an XPath on `rct-block` also
  matches its `rct-block-title` and returns the title alone (an empty list).

### Extra services (`BookingDetailsPage.addExtraServices`)

- **Update Extra Service** (from Car Received on) opens a dialog of checkboxes
  named `<service> <price>` — `GPS 5 SAR / Rent`, `Child Car Seat 5 SAR / Day`,
  `yata Free` — with **Edit** and **Cancel**. 39 services today, three names
  repeated at different prices (`test2`, `test3`, `addition driver12`), so
  pinned services must be unique: `testData.newBooking.extraServices`.
- **Edit** sends `CustomerUpdateRentalExtraServices { allyExtraServices,
  branchExtraServices, rentalId }` (ids, split by who offers the service) and
  toasts "Rent has been edited successfully". Reopening shows them ticked.
- A per-Rent service is charged once, a per-Day one times the rental days.
  About Price lists each (`Child Car Seat 20`, `GPS 5`), then their sum;
  its Total, VAT and the booking's Price before tax / Tax / Grand Total all
  include them. **Its Due Amount does not** (known issue below). Invoicing then
  uses the Grand Total.
- **Open the booking fully before acting.** `open()` also waits for
  `GetAllyCompanyQuery`, `Branch` and `GetCarProfile`: clicking Update Extra
  Service before they answer throws `undefined is not iterable` and blanks the
  whole page (4 of 4 tries; 0 of 4 after waiting).
- `aboutPrice(label)` matches a line that is just label + amount, so `Total`
  does not pick up `Total days (4)`.

### Changing duration (`BookingDetailsPage.changeDropoff`)

- **Change Duration** (from Car Received on) opens a dialog with the Pickup and
  Drop off date fields — in Arabic here too — and **Change**. The spec moves the
  drop-off a day later. Change sends `EditRentalDuration { pickUpDate,
  pickUpTime, dropOffDate, dropOffTime, rentalId }`, with no confirmation, and
  toasts "Rent has been edited successfully".
- The booking is repriced: days, Price before tax, Tax and Grand Total follow,
  and **per-day extra services are recharged for the new length** (5 days:
  495 + GPS 5 + child seat 25 = 525, VAT 78.75, 603.75). Invoicing then uses
  that Grand Total.

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

- The close reasons are radios that ignore `check()` — click the label. They
  share the name `gender1` with the status radios in the dialog still open
  behind, and the choice occasionally does not stick; the click is repeated
  until it does.
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
- **About Price's Due Amount ignores extra services.** With GPS and a child
  seat added (25), About Price shows Total 421 and VAT 63.15 but Due Amount
  455.4 — the pre-extras figure — while the booking's Grand Total is 484.15.
  Seen before and after invoicing. Marked `test.fail` in the lifecycle.
- **Opening Update Extra Service too early blanks the page.** Clicked before
  the ally/branch/car queries answer, the page throws
  `undefined is not iterable` and renders nothing. Specs wait; not given a
  failing spec, because whether a click lands early is timing.
- **Edit Booking shows dates in Arabic** when opened with the Edit button on
  the English dashboard — the Pickup/Drop off fields and the whole date picker
  (month names, weekday names, digits). Opening the edit URL directly shows
  them in English. Timeline times are in Arabic digits too.
- **The Agency Name filter is ignored.** The choice is written into the page URL
  (`agency: [{ id: "199", ... }]`) but not into `GetBookingsQuery`'s variables,
  so the total is unchanged. The field is also shown twice.

## Open questions for the product

- **Closed, invoiced bookings can still be repriced.** Update Extra Service
  and Change Duration are offered and accepted on a closed booking: 21606 went
  from 455.4 to 484.15 after closing, 21608 from 484.15 to 603.75. Whether
  that is intended is for the product to say; no spec relies on it.

## Working style

Explore the live dashboard and confirm selectors before writing a test; report
what blocks rather than adding workarounds; when something fails, capture
evidence (URL, dialogs, network payloads) before theorising.
