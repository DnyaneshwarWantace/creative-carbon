export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_production.resin.view'],
  pageTitle: 'Chemical issue',
  pageTitleKey: 'cc_production.nav.chemicalIssue',
  pageGroup: 'Plant',
  pageGroupKey: 'cc-04-plant.nav.group',
  pageOrder: 15,
  icon: 'beaker',
  navHidden: true,
  breadcrumb: [
    { label: 'Chemical issue', labelKey: 'cc_production.nav.chemicalIssues', href: '/backend/resin/issues' },
    { label: 'Issue', labelKey: 'cc_production.nav.chemicalIssue' },
  ],
}
