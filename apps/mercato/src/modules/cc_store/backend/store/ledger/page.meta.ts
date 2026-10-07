export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_store.view'],
  pageTitle: 'Stock ledger',
  pageTitleKey: 'cc_store.nav.ledger',
  pageGroup: 'Store',
  pageGroupKey: 'cc-06-store.nav.group',
  pageOrder: 5,
  icon: 'history',
  breadcrumb: [
    { label: 'Stock', labelKey: 'cc_store.nav.stock', href: '/backend/store/stock' },
    { label: 'Stock ledger', labelKey: 'cc_store.nav.ledger' },
  ],
}
