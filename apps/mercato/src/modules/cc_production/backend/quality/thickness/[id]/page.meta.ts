export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_production.quality.view'],
  pageTitle: 'Thickness inspection',
  pageTitleKey: 'cc_production.nav.thicknessOne',
  pageGroup: 'QC & lab',
  pageGroupKey: 'cc-08-qc.nav.group',
  icon: 'ruler',
  navHidden: true,
  breadcrumb: [
    { label: 'Thickness inspection', labelKey: 'cc_production.nav.thickness', href: '/backend/quality/thickness' },
    { label: 'Thickness inspection', labelKey: 'cc_production.nav.thicknessOne' },
  ],
}
