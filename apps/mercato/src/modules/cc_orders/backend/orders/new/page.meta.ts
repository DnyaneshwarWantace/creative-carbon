export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_orders.manage'],
  pageTitle: 'Book new order',
  pageTitleKey: 'cc_orders.nav.new',
  pageGroup: 'Sales',
  pageGroupKey: 'cc-01-sales.nav.group',
  pageOrder: 11,
  icon: 'plus',
  breadcrumb: [
    { label: 'Orders', labelKey: 'cc_orders.nav.orders', href: '/backend/orders' },
    { label: 'New order', labelKey: 'cc_orders.nav.new' },
  ],
}
