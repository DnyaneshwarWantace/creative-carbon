export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_production.quality.view'],
  pageTitle: 'Cutting entry',
  pageTitleKey: 'cc_production.nav.cuttingEntry',
  pageGroup: 'Plant',
  pageGroupKey: 'cc-04-plant.nav.group',
  icon: 'scissors',
  navHidden: true,
  breadcrumb: [
    { label: 'Cutting & trimming', labelKey: 'cc_production.nav.cutting', href: '/backend/cutting' },
    { label: 'Cutting entry', labelKey: 'cc_production.nav.cuttingEntry' },
  ],
}
