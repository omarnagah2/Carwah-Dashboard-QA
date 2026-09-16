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
  admin: {
    email: process.env.DASHBOARD_ADMIN_EMAIL ?? '',
    password: process.env.DASHBOARD_ADMIN_PASSWORD ?? '',
  },
};
