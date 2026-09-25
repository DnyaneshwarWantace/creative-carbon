export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_orders.view'],
  pageTitle: 'Order stage',
  pageTitleKey: 'dermat_orders.nav.stage',
  pageGroup: 'Sales',
  pageGroupKey: 'dermat-01-sales.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Orders', labelKey: 'dermat_orders.nav.orders', href: '/backend/orders' },
    { label: 'Stage', labelKey: 'dermat_orders.nav.stage' },
  ],
}
