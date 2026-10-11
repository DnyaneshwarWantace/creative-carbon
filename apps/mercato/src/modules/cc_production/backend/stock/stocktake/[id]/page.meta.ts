export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_store.view'],
  pageTitle: 'Stocktake',
  pageTitleKey: 'cc_production.nav.stocktakeRecord',
  pageGroup: 'Store',
  pageGroupKey: 'cc-06-store.nav.group',
  navHidden: true,
  breadcrumb: [{ label: 'Stocktake', labelKey: 'cc_production.nav.stocktake', href: '/backend/stock/stocktake' }, { label: 'Count', labelKey: 'cc_production.nav.stocktakeRecord' }],
}
