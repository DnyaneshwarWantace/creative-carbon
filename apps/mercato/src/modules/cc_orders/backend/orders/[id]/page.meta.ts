export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_orders.view'],
  pageTitle: 'Order',
  pageTitleKey: 'cc_orders.nav.order',
  pageGroup: 'Sales',
  pageGroupKey: 'cc-01-sales.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Orders', labelKey: 'cc_orders.nav.orders', href: '/backend/orders' },
    { label: 'Order', labelKey: 'cc_orders.nav.order' },
  ],
}
