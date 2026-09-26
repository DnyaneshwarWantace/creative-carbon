export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_vendors.view', 'dermat_purchase.view'],
  pageTitle: 'Vendor',
  pageTitleKey: 'dermat_vendors.page.vendor',
  pageGroup: 'Purchase',
  pageGroupKey: 'dermat-05-purchase.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Vendors', labelKey: 'dermat_vendors.page.title', href: '/backend/dermat_vendors' },
    { label: 'Vendor', labelKey: 'dermat_vendors.page.vendor' },
  ],
}
