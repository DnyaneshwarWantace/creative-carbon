export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_vendors.manage'],
  pageTitle: 'Edit vendor',
  pageTitleKey: 'cc_vendors.edit.title',
  pageGroup: 'Raw material',
  pageGroupKey: 'cc-06a-raw.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Vendors', labelKey: 'cc_vendors.page.title', href: '/backend/cc_vendors' },
    { label: 'Edit vendor', labelKey: 'cc_vendors.edit.title' },
  ],
}
