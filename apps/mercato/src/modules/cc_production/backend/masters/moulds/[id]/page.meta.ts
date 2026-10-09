export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_production.masters.view'],
  pageTitle: 'Die',
  pageTitleKey: 'cc_production.nav.die',
  pageGroup: 'Masters',
  pageGroupKey: 'cc-11-masters.nav.group',
  pageOrder: 81,
  icon: 'shapes',
  navHidden: true,
  breadcrumb: [
    { label: 'Moulds & dies', labelKey: 'cc_production.nav.moulds', href: '/backend/masters/moulds' },
    { label: 'Die', labelKey: 'cc_production.nav.die' },
  ],
}
