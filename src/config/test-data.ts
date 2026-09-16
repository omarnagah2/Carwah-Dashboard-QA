/**
 * Everything a spec needs to know about the environment lives here, and every
 * value can be overridden from the environment so a run can be pointed
 * elsewhere without editing code. Credentials come only from the environment
 * (see `.env.example`), never from this file.
 */
export const testData = {
  /** Pre-prod dashboard, served over HTTP on a non-standard port. */
  baseUrl: process.env.DASHBOARD_URL ?? 'http://pre_dashboard.carwah.co:8880',
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
  admin: {
    email: process.env.DASHBOARD_ADMIN_EMAIL ?? '',
    password: process.env.DASHBOARD_ADMIN_PASSWORD ?? '',
  },
};
