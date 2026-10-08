export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_production.quality.view'],
  pageTitle: 'FG inspection report',
  pageTitleKey: 'cc_production.nav.fgReport',
  pageGroup: 'QC & lab',
  pageGroupKey: 'cc-08-qc.nav.group',
  icon: 'clipboard-check',
  navHidden: true,
  breadcrumb: [
    { label: 'FG inspection', labelKey: 'cc_production.nav.fgInspection', href: '/backend/quality/fg-inspection' },
    { label: 'FG inspection report', labelKey: 'cc_production.nav.fgReport' },
  ],
}
