export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_production.quality.view'],
  pageTitle: 'Bought-in goods',
  pageTitleKey: 'cc_production.nav.directInOne',
  pageGroup: 'Store',
  pageGroupKey: 'cc-06-store.nav.group',
  icon: 'package-plus',
  navHidden: true,
  breadcrumb: [
    { label: 'Bought-in & damaged', labelKey: 'cc_production.nav.directIn', href: '/backend/fg/direct-in' },
    { label: 'Bought-in goods', labelKey: 'cc_production.nav.directInOne' },
  ],
}
