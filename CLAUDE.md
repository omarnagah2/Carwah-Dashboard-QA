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
├── bookings/       bookings-list, bookings-filters (read-only),
│                   recall-gateway (clicks Recall Gateway on one customer booking),
│                   booking-lifecycle (writes: one booking per run, closed at the end)
└── customers/      customers-list, customers-filters (read-only),
                    customer-lifecycle (writes: adds one customer per run,
                    edits it, deletes it at the end)
src/pages/     page objects (BasePage copied from Carwah UI), signin,
               list (shared list base), filter-panel (shared Filter panel),
               detail-list (the details pages' label/value items),
               bookings (list), booking-filters (panel), booking-details,
               booking-form (shared price summary), add-booking, edit-booking,
               date-time-picker (the MUI picker behind every booking date field),
               extension-requests (the dialog),
               customers (list), customer-filters, customer-details,
               customer-form (shared by add-customer and edit-customer)
src/fixtures/  test.ts — the `test` every spec imports (static cache + API pacing)
src/utils/     graphql.ts (isOperation), static-cache.ts, api-throttle.ts, text.ts
src/config/    test-data.ts (all data, env-overridable), auth.ts
src/reporters/ environment-classifier (copied from Carwah UI)
```

## Commands

```bash
npx playwright test
npx playwright test --grep-invert "booking lifecycle"   # without creating a booking
npm run typecheck
npm run clean:cache                                       # drop the cached bundle
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
- **Import `test`/`expect` from `src/fixtures/test`**, not
  `@playwright/test`: every context the suite opens (setup's probe context
  too, via `prepareContext`) needs the two routes below.
- **The bundle is cached on disk** (`.cache/static`). The dashboard is a CRA
  build with content-hashed files under `/static/`, ~8.6 MB per page load —
  one vendor chunk is 7 MB — and each test starts with an empty HTTP cache.
  When pre-prod's throughput dipped that chunk missed the 30s navigation
  timeout and `page.goto` failed before the page existed. Cached, setup went
  from ~15s to ~7s. `npm run clean:cache` is always safe.
- **The API rate-limits** (`429 {"message":"Too Many Requests"}`), and once
  pages loaded fast the filter specs tripped it: the list rendered "No records
  found!" with no tabs. **A request cannot be resent** — each carries a nonce
  and a repeat gets `400 Duplicated: nonce`, even after a 429 — so
  `paceApiCalls` holds requests back instead: at most
  `API_REQUESTS_PER_10S` (default 20) per 10s across the worker, roughly the
  rate the suite ran at before the cache and never saw a 429.
  `BookingsPage.open` fails with the API's answer when the list query fails.
  Pacing holds a page's queries up to ~7s, so page loads wait up to 30s;
  `[api]` lines in the output name any call the API refuses (the page just
  renders nothing) and any request held over 10s.

## Bookings (/cw/dashboard/bookings)

- **The list and filter specs are read-only.** Pre-prod bookings are shared and
  change while a run is going (new ones arrive every few minutes), so nothing
  pins a booking or compares exact counts across two reads. Only
  `booking-lifecycle.spec.ts` writes to bookings of its own, and
  `recall-gateway.spec.ts` recalls one customer booking's payment (see below).
- **Two tables are on the page**: a hidden ratings table comes first, so the
  bookings table is the one with a `Booking ID` column header.
- **Columns are found by header**, not index (`BookingsPage.column`) — there
  are 19 of them and positions are easy to miscount.
- **Status tabs are named `<count> <status>`** and several share a prefix
  (Pending / Pending Extend / Pending Review), so the name is anchored. The
  selected tab and page are kept in the URL
  (`?{"status":"pending",...}#page=2`).
- **The Pending tab holds everything awaiting a decision** (confirmed by the
  product): pending bookings *and* bookings with a pending extension request,
  e.g. `Car Received PENDING EXTEND` (`status: "pending"` returns both).
  Pending Extend also has its own tab.
- **Every list change is a `GetBookingsQuery`** on
  `prebeta.carwah.co:2052/graphql`; `reloadingList` waits for it so assertions
  read the new rows, not the old ones.
- **Pagination buttons are matched exactly**: past 2000 pages
  "Go to page 2" also names "Go to page 2001".
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
- While an extension request is pending, Change Duration and Update Price
  leave the bar; after a confirmed extension they do not come back.
- Every action on the details page is covered.

## Customers (/cw/dashboard/customers)

- **The list and filter specs are read-only.** They look up the bookings'
  dedicated test customer (`591593593`, customer 202) by mobile and read
  everything else from the dashboard. Only `customer-lifecycle.spec.ts`
  writes (below), and only to the customer it adds.
- **The list is empty until a search names a customer.** On load it sends
  `GetUsersList { page, limit, isActive: null, type: "customers" }` and gets
  `totalCount: 0` — "No records found!", no table. Only a search with a
  customer name, email, national ID or mobile returns anyone; the dropdowns
  alone (Type, Customer Status, Status, Agency Name) also return nobody.
  **This is by design** (confirmed by the product): listing every customer
  would be too much data. So the dropdown specs combine each with a national ID
  fragment (`testData.customers.broadNationalId`, ~230 customers).
- The list uses the same pieces as bookings — `ListPage` (table picked by its
  `Customer ID` header, `Total Results`, pagination, page size) and
  `FilterPanel` (react-selects found by placeholder: `Type`,
  `Customer Status`, `Status`, `Agency Name`). Text fields: `#customerName`,
  `#email`, `#nid`, and `#input-tel` for the mobile.
- Search sends: `customerName` **and** `name` (the same value), `email`,
  `nid` (partial: `1` matches hundreds), `mobile: '966…'`,
  `customerStatuses: ['resident']` (Type), `blockingStatus: 'blocked' |
  'partially_blocked'` (Customer Status), `isActive` (Status),
  `agencyIds: [199]`. The API's rows carry `status`,
  `customerProfile.blockingStatus`, `isActive` and
  `agencyCustomerProfiles[].agencyId`, which the specs check.
- **Clear sends no query**: it empties the panel, drops the filter from the
  URL and shows the empty list the page already has (Apollo's cached
  unfiltered answer). Pages keep the filter (`page: 2` with the same `nid`).
- Columns: `#`, Customer ID, Customer Name (with an empty
  `title="UnVerified via Yakeen"` badge), Customer phone number, Customer
  email, Bookings (a link to `/bookings?{"userId":"<id>"}`, the bookings list
  for that customer), Created date (`May 28, 2024 10:39 AM`), Customer
  Status (Active/Inactive), Actions: **Edit** (the edit page), **delete**
  (`<i title="delete">`, never clicked) and **Timeline** (a "Customer
  TimeLine" dialog filled by `CustomerAudits { id }` — empty for customer
  202, "No records found!").
- **Details** (`/customers/<id>`, `GetCustomerDetailsQuery { id }` and
  `UserWallet`): the same `li.list_item_info` items as bookings — First name,
  Last Name, Email address, Mobile Number, User Type, Status, Date of Birth,
  Gender, Driver license expiry, Customer Class, Wallet balance, Successful
  Bookings, National ID, Age — then the profile and licence images and
  **Edit Customer**. Customer 202 has 131 bookings but "Successful Bookings 3".
- **Edit** (`/customers/<id>/edit`) is the Add Customer form filled in: names,
  email, the mobile **disabled** (`+966 591 593 593`, named by its
  placeholder `512345678*`), company, react-selects without labels (gender,
  type, blocking, agencies, active), national ID and version, Gregorian and
  Hijri dates, licence number, class, three images, **Save** and **Cancel**
  (back to the list, nothing sent — the spec checks no mutation went out).
  **Add customer** opens `/customers/add`, the same form empty.

### Adding and deleting (`customer-lifecycle.spec.ts`)

- **This spec writes to pre-prod: every run adds one real customer and
  deletes it at the end** (agreed with the suite's owner). The steps are
  serial and never retried; if one fails, `afterAll` still deletes the
  customer. The id is printed and added as a `created customer` annotation.
- **The data is generated per run** (`testData.customers.newCustomer()`):
  mobile `59` + the last 7 digits of the time (the owner's choice), national
  ID `100` + the same 7, email `auto.customer.<7>@example.com`, name
  `Automated Customer <7>`. The first step checks the mobile is unused.
- **Required**: First Name, Last Name, Email, mobile, National ID, National ID
  and Driver license expiry (Gregorian), Date of Birth (Gregorian) and the
  driver licence image. Saving empty shows 9 "Required field" (the Hijri
  twins of the dates are flagged too, though they fill themselves in),
  "Please enter right mobile number" and "This image is required", and sends
  nothing. Defaults: Male, Citizen, Unblocked, no agencies, Active, Basic
  member.
- The date fields open an **MUI date picker on a year list**, then months,
  then days, closed with **Ok** (`pickCalendarDate`); the field reads
  DD-MM-YYYY and its Hijri twin fills in. **The Driver license Hijri field
  carries the Gregorian placeholder**, so date fields are taken as the first
  match of their placeholder.
- **Save uploads the image first**: `ImageUpload { image: <data URL>,
  topic: "licenseFrontImage", isSecured: true }` → `secureUploadImage` with an
  S3 URL; then `AddCustomerMutation` with that URL, the dates as
  DD/MM/YYYY and the mobile as `966…` → `addCustomer { errors: [], status:
  "success", user { id } }`. The page returns to the (empty) list, no toast.
  The image is `src/fixtures/files/driver-license.png`, a 32×32 PNG.
- A new customer's details lack Wallet balance and Successful Bookings.
- **Delete** (the list's `delete` icon) asks "Are You Sure ? You Want Delete
  This Customer" (Cancel / delete) → `DeleteCustomer { input: { userId } }`
  → `status: "success"`, and the list reloads without them. **It is a soft
  delete**: searches no longer find the customer, but the details page still
  opens (`customerProfile.isDeleted: true`) with Status **Deleted**.
- **Names are limited to 20 characters** (first, middle and last, on both
  forms; digits and spaces are fine), but the message says "Min. 1, Max. 100
  character" (known issue below). A generated last name is `Customer
  <7 digits>` (16), so the edit sets a fixed, short one.
- **Editing** (`EditCustomerPage.save`): the spec changes the middle and last
  names, company and customer class (Basic → Gold member) of the customer it
  added. The form's react-selects have no labels, so `choose(current,
  option)` finds one by the value it shows. **Wait for the dates** before
  saving: they (and their Hijri twins) fill in after the names, and an early
  Save is refused with "Required field". Save sends `EditCustomerMutation`
  — the whole form plus `userId`, the licence image as the signed URL it was
  loaded with (no new upload) — answered `editCustomer { errors: [],
  status: "success" }`, and returns to the list, no toast. A refused form
  sends nothing; `save()` fails with the message and the invalid fields.
- Changing the type to **Resident** brings its own rules: the national ID
  must "start with 2, and consist of 10 digits", and another field becomes
  required.
- **Timeline** (`CustomerAudits`, newest first): `create` with every field,
  then `update` with `oldData`/`newData` of the changed ones in database
  names (`last_name`, `middle_name`, `company_name`, `customer_class`).
  **Every edit also logs `license_front_image` as changed**, because the form
  sends back a freshly signed URL for the same file.
- Explored with customers 1342–1350, all deleted.

## Printing (`BookingDetailsPage.print`)

- **Print** sends `GenerateRentalPdf { rentalId }`, then polls
  `RentalPdfStatus` (every ~200ms; `status: in_progress`, `fileUrl: null`)
  until it carries a `fileUrl` — an S3 link under
  `rental-pdfs/<yyyy>/<mm>/<booking id>/` whose content disposition names the
  file `rental-<booking no.>.pdf` — and downloads it through a blob URL. It
  took ~12s; each print generates a new PDF.
- The PDF's text is in embedded fonts and cannot be read without a PDF
  library, so the spec checks what the API says the file is (this booking's
  folder and number) and that the download is a real PDF (`%PDF-`, >10 KB),
  and attaches it to the report.
- **The download is named after the blob** (`b44ca137-….pdf`), not
  `rental-<booking no.>.pdf` (known issue below).

## Recall Gateway (`recall-gateway.spec.ts`)

- A refresh icon beside the status badge (`<i role="button" aria-label="Recall
  Gateway">`), shown **only on an online booking whose Payment Status is
  Pending** — a payment started at the gateway with no result yet. Not on
  Paid or Not Paid online bookings, nor on cash ones, so the lifecycle's
  bookings never have it.
- Clicking sends `RecallPaymentGateway { rentalId }` — a **query**, answered
  with the rental payment's id — then reloads the booking and toasts
  "payment gateway recall success". Booking 21539 went Pending → **Paid**
  ("Paid by customer - Jack Quinn", Paid and reserved badges) and lost the
  icon; 21582 stayed Pending and kept it.
- **The list shows a pending gateway payment as "Not Paid"**; only the
  details page says Pending. The spec therefore opens up to five Online "Not
  Paid" bookings from the Pending tab to find one, and skips if none.
- **It clicks the icon on one real customer booking per run**, as agreed with
  the suite's owner: the recall only brings the payment status in line with
  the gateway. It checks the answer, the toast, and that the icon is shown
  exactly while the status is still Pending.

## Booking lifecycle (`booking-lifecycle.spec.ts`)

### Creating (`AddBookingPage`)

- **This spec writes to pre-prod: every run creates one real booking** for the
  dedicated test customer `591593593` (Omar Nagah) — never Carwah UI's
  `534271861` — at Hegazy Cars / Hegazy Riyadh, Suzuki Dzire 2021 at 99/day,
  cash, the form's default three days from now (all in `testData.newBooking`),
  assigns it to customer care, extends it by a day, confirms it, hands the
  car over, adds a note and extra services, lengthens it by another day,
  lowers its daily price, charges an extra fee, has an extension request
  rejected and another confirmed, invoices, closes and prints it. The
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
- **The default pickup is two hours from now, Riyadh time** (the return three
  days after), so late in the evening the booking starts tomorrow; the spec
  computes the expected date in `Asia/Riyadh`, not the machine's zone.
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
- **Two ways a service is charged** (confirmed by the product): per Rent, once
  for the whole booking, or per Day, times the rental days — so per-day
  services follow every change of length (GPS stays 5; the child seat went
  20 → 25 → 35/40 as the booking grew).
  About Price lists each (`Child Car Seat 20`, `GPS 5`), then their sum;
  its Total, VAT and the booking's Price before tax / Tax / Grand Total all
  include them. **Its Due Amount does not** (known issue below). Invoicing then
  uses the Grand Total.
- **Open the booking fully before acting.** `open()` also waits for
  `GetAllyCompanyQuery`, `Branch` and `GetCarProfile`: clicking Update Extra
  Service before they answer throws `undefined is not iterable` and blanks the
  whole page (4 of 4 tries; 0 of 4 after waiting). Branch is fetched again
  after that, and a click before those later fetches blanked the page once
  more, so `open()` finally waits for the network to go quiet (the page does
  not poll). The query waits get the navigation timeout (30s): on a slow
  pre-prod they are not even sent for several seconds.
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

### Updating the price (`BookingDetailsPage.updatePrice`)

- **Update Price** (from Car Received on) opens a dialog with one field,
  **Suggested price per day** (`#suggestedPricePerDay`), and **Edit** —
  enabled even while the field is empty. The field **opens empty** even when
  a price was set before. Edit sends `EditSuggestedPrice { rentalId,
  suggestedPrice }` and toasts "Rent has been edited successfully".
- The booking then charges the suggested price: its **Price per day** reads
  80, and Price before tax / Tax / Grand Total follow (5 days at 80 = 400,
  plus extras 30 = 430, VAT 64.5, 494.5). **About Price keeps the list price**
  (Price per day 99, Total days 495) and adds a line
  `Discount (Special dis.) - (19.19)% 95` — the difference × days, as a
  percentage of the list price. Its Due Amount does follow here (494.5).

### Extra fees (`BookingDetailsPage.addExtraFee`)

- **Add Extra Fees** opens a dialog with **Extra Fees Name**, **Extra Fees
  Amount** and a note textarea; **Add** stays disabled until all three are
  filled. Add sends `AddExtraFee { rentalId, name, amount, note }`; success
  answers `errors: null` (not `[]`) with the created `extraFee`.
- The fee is **taxed with the rest**: About Price gains an **Extra Fees**
  section (`Automated test fee 20`), and Total, VAT, Due Amount and the
  booking's Price before tax / Tax / Grand Total all include it. Invoicing
  then uses that Grand Total.
- **On a closed booking the button is offered but the API refuses the fee**
  with `Invalid rental status` (a red toast), so the spec charges it before
  invoicing, while the booking is Car Received.

### Extension requests (`ExtensionRequests`)

- **Only a Car Received booking can be extended** (the product rule): the
  Extension Requests dialog shows **Add** then, and not once the booking is
  Invoiced or Closed (the spec checks Invoiced). Pending and Confirmed
  bookings have no Extension Requests button at all.
- **Add** appends a draft row: a `dropoff Date` field (the MUI picker, in
  English here, opening on the day after the current drop-off and **keeping
  the current time of day**, not the booking's), a recommended price field, a
  Paid/Not Paid select (never sent) and **Create request**, enabled once a
  date is picked. Picking sends `RentalExtensionRequestPrice`, whose
  `extensionDays` and `totalRemainingPrice` the row shows. Create sends
  `CreateRentalDateExtensionRequest`.
- A pending request sets the SubStatus to **Pending extend** and changes
  nothing else yet. Its row has **Confirm** and **Reject** icons
  (`label[title=…]`; Confirm's icon carries a `disabled` attribute that does
  nothing).
  - **Reject** acts at once, no confirmation:
    `RejectRentalDateExtensionRequest` → SubStatus **Rejected extend**, row
    Rejected, no actions left, booking unchanged.
  - **Confirm** asks (SweetAlert "Are you sure you want to confirm this
    extension?" → Yes): `ConfirmRentalDateExtensionRequest` → SubStatus
    **Booking extended**; the return date, days (+ extensionDays) and Grand
    Total (+ totalRemainingPrice) move; the row reads Confirmed, **Paid**,
    paid by `customer - <name>` even though Paid was never chosen.
- Requests are numbered `<booking no.>-2`, `-3`…, newest first. A new request
  is allowed after a rejected one, but **not until a confirmed extension's
  period has begun** — Add is still offered, and the API answers "A new
  extension can only be requested after the current confirmed extension
  period begins."
- **How an extension is priced** (from the product): from the car's daily,
  weekly and monthly prices. Unless the ally is on fixed extension prices, a
  booking that an extension takes to a week (or to 30 days) is **re-priced
  from the start** at the weekly (monthly) rate and the customer pays only
  the difference; a customer with free days sees the extension at 0 until
  they run out. On fixed prices (`isExtendFixedPrice`, "Extend - rental
  fixed price" on the ally's page) the booking keeps the rate it started on.
  **Hegazy Cars is not fixed** (`isExtendFixedPrice: false`), so the
  lifecycle booking, taken from 5 to 7 days, is re-priced weekly: 88/day with
  the 9.09% special discount is still 80.
- The spec takes days and price from the API's quote, since the time of day
  (and so the rounding) depends on when it runs, and checks the booking adds
  exactly that. It does not rederive the figure — the fee bug below makes it
  wrong by design.
- A row's text content runs its cells together (`CashPendingNot Paid`), so
  rows are matched by cell, not by text.

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
- `reloadingList` waits at most 30s for the query (pacing has held one over
  10s), so a filter that never
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
- **Re-pricing for an extension drops the extra fees.** Taking the lifecycle
  booking from 5 to 7 days (re-priced weekly) quotes a difference of 172.5 =
  150 + VAT, i.e. new 600 − old 450: the new total leaves out the 20 fee the
  old one included. Afterwards About Price still lists the fee (560 + extras
  40 + fee 20) but shows Total 600 and Due 690 instead of 620 and 713, and
  the booking's Grand Total is 690 (booking 21620). Marked `test.fail` in the
  lifecycle.
- **Add Extra Fees is offered on closed bookings that cannot take a fee.**
  The dialog opens and accepts input, and only the API's
  `Invalid rental status` says otherwise.
- **Printed PDFs are saved under a random name.** The API names the file
  `rental-<booking no.>.pdf`, but the page downloads it through a blob URL,
  so the browser saves `<uuid>.pdf`. Marked `test.fail` in the lifecycle.
- **Edit Booking shows dates in Arabic** when opened with the Edit button on
  the English dashboard — the Pickup/Drop off fields and the whole date picker
  (month names, weekday names, digits). Opening the edit URL directly shows
  them in English. Timeline times are in Arabic digits too.
- **The Agency Name filter is ignored.** The choice is written into the page URL
  (`agency: [{ id: "199", ... }]`) but not into `GetBookingsQuery`'s variables,
  so the total is unchanged. The field is also shown twice.

- **The customer name limit is misreported.** A 21-character first, middle
  or last name is refused on Add and Edit Customer with "Min. 1, Max. 100
  character"; the real limit is 20. Marked `test.fail` in the customer
  lifecycle.
- **Every customer edit logs the licence image as changed.** The form sends
  the image back as a newly signed S3 URL, so the Timeline shows a Driver
  License change on edits that did not touch it.

## Open questions for the product

- **Closed, invoiced bookings can still be repriced.** Update Extra Service
  and Change Duration are offered and accepted on a closed booking: 21606 went
  from 455.4 to 484.15 after closing, 21608 from 484.15 to 603.75. Whether
  that is intended is for the product to say; no spec relies on it.

## Working style

Explore the live dashboard and confirm selectors before writing a test; report
what blocks rather than adding workarounds; when something fails, capture
evidence (URL, dialogs, network payloads) before theorising.
