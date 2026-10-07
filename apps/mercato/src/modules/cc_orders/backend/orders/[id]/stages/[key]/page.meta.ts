export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_orders.view'],
  pageTitle: 'Order stage',
  pageTitleKey: 'cc_orders.nav.stage',
  pageGroup: 'Sales',
  pageGroupKey: 'cc-01-sales.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Orders', labelKey: 'cc_orders.nav.orders', href: '/backend/orders' },
    { label: 'Stage', labelKey: 'cc_orders.nav.stage' },
  ],
}
