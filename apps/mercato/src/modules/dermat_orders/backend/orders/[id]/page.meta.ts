export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_orders.view'],
  pageTitle: 'Order',
  pageTitleKey: 'dermat_orders.nav.order',
  pageGroup: 'Sales',
  pageGroupKey: 'dermat-01-sales.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Orders', labelKey: 'dermat_orders.nav.orders', href: '/backend/orders' },
    { label: 'Order', labelKey: 'dermat_orders.nav.order' },
  ],
}
