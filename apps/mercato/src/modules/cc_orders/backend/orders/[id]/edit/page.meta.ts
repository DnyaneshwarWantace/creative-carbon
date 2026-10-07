export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_orders.manage'],
  pageTitle: 'Edit order',
  pageTitleKey: 'cc_orders.nav.edit',
  pageGroup: 'Sales',
  pageGroupKey: 'cc-01-sales.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Orders', labelKey: 'cc_orders.nav.orders', href: '/backend/orders' },
    { label: 'Edit', labelKey: 'cc_orders.nav.edit' },
  ],
}
