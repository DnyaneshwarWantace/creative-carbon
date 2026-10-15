export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_vendors.manage'],
  pageTitle: 'Import vendors',
  pageTitleKey: 'cc_customers.import.titleVendors',
  pageGroup: 'Raw material',
  pageGroupKey: 'cc-06a-raw.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Vendors', labelKey: 'cc_vendors.nav.vendors', href: '/backend/cc_vendors' },
    { label: 'Import vendors', labelKey: 'cc_customers.import.titleVendors' },
  ],
}
