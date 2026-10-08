export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_vendors.manage'],
  pageTitle: 'Import vendors',
  pageTitleKey: 'cc_customers.import.titleVendors',
  pageGroup: 'Purchase',
  pageGroupKey: 'cc-05-purchase.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Vendors', labelKey: 'cc_vendors.nav.vendors', href: '/backend/cc_vendors' },
    { label: 'Import vendors', labelKey: 'cc_customers.import.titleVendors' },
  ],
}
