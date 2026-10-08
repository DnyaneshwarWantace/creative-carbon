export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_production.quality.enter'],
  pageTitle: 'New lab test',
  pageTitleKey: 'cc_production.nav.lab.new',
  pageGroup: 'QC & lab',
  pageGroupKey: 'cc-08-qc.nav.group',
  navHidden: true,
  breadcrumb: [{ label: 'Lab test reports', labelKey: 'cc_production.nav.lab', href: '/backend/quality/lab' }, { label: 'New lab test', labelKey: 'cc_production.nav.lab.new' }],
}
