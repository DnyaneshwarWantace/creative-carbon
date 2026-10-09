export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_vendors.manage'],
  pageTitle: 'Edit vendor',
  pageTitleKey: 'cc_vendors.edit.title',
  pageGroup: 'Purchase',
  pageGroupKey: 'cc-05-purchase.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Vendors', labelKey: 'cc_vendors.page.title', href: '/backend/cc_vendors' },
    { label: 'Edit vendor', labelKey: 'cc_vendors.edit.title' },
  ],
}
