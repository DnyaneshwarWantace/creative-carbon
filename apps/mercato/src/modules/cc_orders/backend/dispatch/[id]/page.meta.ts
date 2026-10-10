export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_orders.view'],
  pageTitle: 'Despatch',
  pageTitleKey: 'cc_orders.nav.despatch',
  pageGroup: 'Sales',
  pageGroupKey: 'cc-01-sales.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Dispatch register', labelKey: 'cc_orders.nav.dispatches', href: '/backend/dispatch/register' },
    { label: 'Despatch', labelKey: 'cc_orders.nav.despatch' },
  ],
}
