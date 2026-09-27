export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_store.view'],
  pageTitle: 'Stock ledger',
  pageTitleKey: 'dermat_store.nav.ledger',
  pageGroup: 'Store',
  pageGroupKey: 'dermat-06-store.nav.group',
  pageOrder: 5,
  icon: 'history',
  breadcrumb: [
    { label: 'Stock', labelKey: 'dermat_store.nav.stock', href: '/backend/store/stock' },
    { label: 'Stock ledger', labelKey: 'dermat_store.nav.ledger' },
  ],
}
