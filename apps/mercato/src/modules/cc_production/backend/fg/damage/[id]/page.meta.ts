export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_production.quality.view'],
  pageTitle: 'Damage entry',
  pageTitleKey: 'cc_production.nav.damageOne',
  pageGroup: 'Store',
  pageGroupKey: 'cc-06-store.nav.group',
  icon: 'package-plus',
  navHidden: true,
  breadcrumb: [
    { label: 'Bought-in & damaged', labelKey: 'cc_production.nav.directIn', href: '/backend/fg/direct-in' },
    { label: 'Damage entry', labelKey: 'cc_production.nav.damageOne' },
  ],
}
