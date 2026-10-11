export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_production.owner.view'],
  pageTitle: 'Production plan',
  pageTitleKey: 'cc_production.nav.plan',
  pageGroup: 'Overview',
  pageGroupKey: 'cc-00-overview.nav.group',
  icon: 'clipboard-list',
  navHidden: true,
  breadcrumb: [
    { label: 'Production plan', labelKey: 'cc_production.nav.plan', href: '/backend/owner/plan' },
    { label: 'Day plan', labelKey: 'cc_production.nav.planDay' },
  ],
}
