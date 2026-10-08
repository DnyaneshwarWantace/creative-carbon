export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_production.quality.view'],
  pageTitle: 'Lab test report',
  pageTitleKey: 'cc_production.nav.lab.report',
  pageGroup: 'QC & lab',
  pageGroupKey: 'cc-08-qc.nav.group',
  navHidden: true,
  breadcrumb: [{ label: 'Lab test reports', labelKey: 'cc_production.nav.lab', href: '/backend/quality/lab' }, { label: 'Lab test report', labelKey: 'cc_production.nav.lab.report' }],
}
