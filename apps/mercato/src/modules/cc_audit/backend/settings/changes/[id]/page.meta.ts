export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_lists.view'],
  pageTitle: 'Settings change',
  pageTitleKey: 'cc_audit.nav.settingsChange',
  pageGroup: 'Masters',
  pageGroupKey: 'cc-11-masters.nav.group',
  icon: 'history',
  navHidden: true,
  breadcrumb: [
    { label: 'Settings change log', labelKey: 'cc_audit.nav.settingsChanges', href: '/backend/settings/changes' },
    { label: 'Settings change', labelKey: 'cc_audit.nav.settingsChange' },
  ],
}
