export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_production.masters.view'],
  pageTitle: 'Machine',
  pageTitleKey: 'cc_production.nav.machine',
  pageGroup: 'Masters',
  pageGroupKey: 'cc-11-masters.nav.group',
  pageOrder: 80,
  icon: 'factory',
  navHidden: true,
  breadcrumb: [
    { label: 'Plant machines', labelKey: 'cc_production.nav.plant', href: '/backend/masters/plant' },
    { label: 'Machine', labelKey: 'cc_production.nav.machine' },
  ],
}
