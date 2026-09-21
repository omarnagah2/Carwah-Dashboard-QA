import type { NewCompany } from '../pages/add-company.page';
import type { NewCustomer } from '../pages/add-customer.page';

/**
 * Everything a spec needs to know about the environment lives here, and every
 * value can be overridden from the environment so a run can be pointed
 * elsewhere without editing code. Credentials come only from the environment
 * (see `.env.example`), never from this file.
 */
export const testData = {
  /** Pre-prod dashboard, served over HTTP on a non-standard port. */
  baseUrl: process.env.DASHBOARD_URL ?? 'http://pre_dashboard.carwah.co:8880',
  /** The GraphQL API the dashboard calls, on another host. */
  apiUrl: process.env.DASHBOARD_API_URL ?? 'http://prebeta.carwah.co:2052/graphql',
  /**
   * Filter values with plenty of bookings on pre-prod. The ally and customer
   * are taken from the list itself; these two cannot be, because the list shows
   * a car's display name rather than its make, and a city only inside the
   * pickup cell.
   */
  bookingFilters: {
    make: process.env.CARWAH_FILTER_MAKE ?? 'Geely',
    city: process.env.CARWAH_FILTER_CITY ?? 'Jeddah',
    // Neither the list nor the API's row says which of these a booking has,
    // so they are pinned to values known to narrow the list without emptying it.
    source: '1 super partner',
    paymentBrand: { label: 'Tabby', sent: 'TABBY' },
    trainStation: 'Hail Station',
    plateNo: '1234',
    airport: 'King Khalid International Airport-Terminal 1',
    agency: 'mh-agency',
  },
  /**
   * What the booking-creation spec books. The customer is a dedicated test
   * customer, not Carwah UI's, so the two suites never contend for one
   * customer's bookings. Created bookings are left as they are: the super
   * admin may create another while one is still pending.
   */
  newBooking: {
    customerMobile: process.env.CARWAH_BOOKING_CUSTOMER ?? '591593593',
    customerName: 'Omar Nagah',
    city: 'Riyadh',
    ally: 'Hegazy Cars',
    branch: 'Hegazy Riyadh',
    /** As the car dropdown names it; the list shows it as `Suzuki - Dzire - 2021`. */
    car: 'Suzuki - Dzire - - 2021',
    listedCar: 'Suzuki - Dzire - 2021',
    dailyPrice: 99,
    /** Charged through Add Extra Fees before invoicing; taxed like the rest. */
    extraFee: {
      name: 'Automated test fee',
      amount: 20,
      note: 'Fee added by the Carwah Dashboard automated test',
    },
    /** What Update Price lowers the daily price to, late in the lifecycle. */
    suggestedPrice: 80,
    /** The form's default rental length. */
    days: 3,
    /**
     * The customer care user the booking is assigned to — the suite's owner,
     * so assignments never land on someone else's queue.
     */
    assignee: process.env.CARWAH_BOOKING_ASSIGNEE ?? 'Omar Nagah',
    /**
     * Extra services added after the handover: one charged once per rental,
     * one per day. Both names are unique in the list (some others repeat).
     */
    extraServices: [
      { name: 'GPS', price: 5, per: 'Rent' },
      { name: 'Child Car Seat', price: 5, per: 'Day' },
    ] as const,
  },
  /**
   * The customers specs look up the bookings' dedicated test customer (by
   * mobile) and read everything else about them from the dashboard.
   */
  customers: {
    testCustomerMobile: process.env.CARWAH_BOOKING_CUSTOMER ?? '591593593',
    /**
     * The list only answers searches that name a customer, so the dropdown
     * filters are combined with a national ID fragment that matches a couple
     * of hundred customers, blocked, inactive and agency ones among them.
     */
    broadNationalId: '1',
    agency: { name: 'mh-agency', id: 199 },
    /**
     * A fresh customer for the add-customer spec, which deletes it at the
     * end. Mobile, email and national ID must be unused, so they carry the
     * run's time: mobiles are `59` + 7 digits (the owner's choice), national
     * IDs `100` + the same 7.
     */
    newCustomer(): NewCustomer {
      const stamp = String(Date.now()).slice(-7);
      return {
        firstName: 'Automated',
        // Names are limited to 20 characters (see CLAUDE.md).
        lastName: `Customer ${stamp}`,
        email: `auto.customer.${stamp}@example.com`,
        mobile: `59${stamp}`,
        nationalId: `100${stamp}`,
        nationalIdExpiry: new Date(2030, 2, 15),
        licenseExpiry: new Date(2030, 3, 16),
        birthDate: new Date(1995, 4, 10),
        licenseImage: 'src/fixtures/files/driver-license.png',
      };
    },
    /** What the lifecycle changes through Edit Customer. */
    edit: {
      lastName: 'Customer Edited',
      middleName: 'Edited',
      companyName: 'Automation Co',
      customerClass: { label: 'Gold member', sent: 'gold_member', shown: 'Gold Member' },
    },
  },
  /**
   * The partners specs read the bookings' ally; the other filter values come
   * from the list itself.
   */
  companies: {
    knownAlly: { id: process.env.CARWAH_ALLY_ID ?? '156039', name: 'Hegazy Cars' },
    /** A class few partners have, so the filter visibly narrows the list. */
    rareClass: 'D',
    /**
     * The suite's own partner, added by `add-company.spec.ts` (156072 was the
     * first). Everything after creation is exercised on it, so ordinary runs
     * add no partners. It is left **inactive** between runs.
     */
    testAlly: {
      id: process.env.CARWAH_TEST_ALLY_ID ?? '156073',
      /** Names are limited to 20 characters, the API says so for the manager. */
      baseline: { managerName: 'Automation Manager', commissionRate: 5, isB2b: false },
      edited: { managerName: 'Automation Mgr 2', commissionRate: 7, isB2b: true },
    },
    /**
     * A fresh partner for the add-partner spec. Partners cannot be deleted,
     * so the spec deactivates it at the end and each run leaves one inactive
     * `Automated Ally …` behind. The mobile, email and commercial
     * registration carry the run's time so they stay unused.
     */
    newCompany(): NewCompany {
      const stamp = String(Date.now()).slice(-6);
      return {
        arName: `شريك اختبار ${stamp}`,
        enName: `Automated Ally ${stamp}`,
        managerName: 'Automation Manager',
        phoneNumber: `59${stamp}0`,
        email: `auto.ally.${stamp}@example.com`,
        allyClass: 'D',
        commercialRegistration: `10${stamp}`,
        commissionRate: 5,
        rate: { name: 'Average', value: 3 },
        image: 'src/fixtures/files/driver-license.png',
      };
    },
  },
  /** The branches specs read the bookings' ally and its Riyadh branch. */
  branches: {
    knownBranch: { id: process.env.CARWAH_BRANCH_ID ?? '161295', name: 'Hegazy Riyadh' },
    ally: 'Hegazy Cars',
    city: 'Riyadh',
  },
  admin: {
    email: process.env.DASHBOARD_ADMIN_EMAIL ?? '',
    password: process.env.DASHBOARD_ADMIN_PASSWORD ?? '',
  },
};
