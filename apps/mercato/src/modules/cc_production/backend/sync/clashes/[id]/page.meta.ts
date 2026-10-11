export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_production.owner.view'],
  pageTitle: 'Sync clash',
  pageTitleKey: 'cc_production.nav.clash',
  pageGroup: 'Overview',
  pageGroupKey: 'cc-00-overview.nav.group',
  icon: 'cloud-off',
  navHidden: true,
  breadcrumb: [
    { label: 'Sync clashes', labelKey: 'cc_production.nav.clashes', href: '/backend/sync/clashes' },
    { label: 'Sync clash', labelKey: 'cc_production.nav.clash' },
  ],
}
