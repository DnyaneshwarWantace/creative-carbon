export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_orders.manage'],
  pageTitle: 'Edit order',
  pageTitleKey: 'dermat_orders.nav.edit',
  pageGroup: 'Sales',
  pageGroupKey: 'dermat-01-sales.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Orders', labelKey: 'dermat_orders.nav.orders', href: '/backend/orders' },
    { label: 'Edit', labelKey: 'dermat_orders.nav.edit' },
  ],
}
