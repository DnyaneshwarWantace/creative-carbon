export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_store.view'],
  pageTitle: 'Stock ledger',
  pageTitleKey: 'cc_store.nav.ledger',
  pageGroup: 'Stock records',
  pageGroupKey: 'cc-06c-records.nav.group',
  pageOrder: 1,
  icon: 'history',
  breadcrumb: [
    { label: 'Stock', labelKey: 'cc_store.nav.stock', href: '/backend/store/stock' },
    { label: 'Stock ledger', labelKey: 'cc_store.nav.ledger' },
  ],
}
