export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_orders.manage'],
  pageTitle: 'Book new order',
  pageTitleKey: 'dermat_orders.nav.new',
  pageGroup: 'Sales',
  pageGroupKey: 'dermat-01-sales.nav.group',
  pageOrder: 11,
  icon: 'plus',
  breadcrumb: [
    { label: 'Orders', labelKey: 'dermat_orders.nav.orders', href: '/backend/orders' },
    { label: 'New order', labelKey: 'dermat_orders.nav.new' },
  ],
}
