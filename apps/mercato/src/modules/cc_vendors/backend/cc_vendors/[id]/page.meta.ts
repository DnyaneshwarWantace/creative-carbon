export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_vendors.view', 'cc_purchase.view'],
  pageTitle: 'Vendor',
  pageTitleKey: 'cc_vendors.page.vendor',
  pageGroup: 'Purchase',
  pageGroupKey: 'cc-05-purchase.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Vendors', labelKey: 'cc_vendors.page.title', href: '/backend/cc_vendors' },
    { label: 'Vendor', labelKey: 'cc_vendors.page.vendor' },
  ],
}
