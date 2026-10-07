export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_orders.view', 'cc_orders.manage'],
  pageTitle: 'Sales work queue',
  pageTitleKey: 'cc_orders.nav.salesQueue',
  pageGroup: 'Sales',
  pageGroupKey: 'cc-01-sales.nav.group',
  pageOrder: 5,
  icon: 'inbox',
  breadcrumb: [{ label: 'Sales work queue', labelKey: 'cc_orders.nav.salesQueue' }],
}
