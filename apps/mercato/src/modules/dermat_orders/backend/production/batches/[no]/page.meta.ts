export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_orders.view'],
  pageTitle: 'Batch',
  pageTitleKey: 'dermat_orders.nav.batch',
  pageGroup: 'Production',
  pageGroupKey: 'dermat-07-production.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Batch register', labelKey: 'dermat_orders.nav.batches', href: '/backend/production/batches' },
    { label: 'Batch', labelKey: 'dermat_orders.nav.batch' },
  ],
}
