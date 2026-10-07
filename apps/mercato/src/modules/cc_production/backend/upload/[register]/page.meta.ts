export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_production.upload.use'],
  pageTitle: 'Upload a register',
  pageTitleKey: 'cc_production.nav.uploadRegister',
  pageGroup: 'Overview',
  pageGroupKey: 'cc-00-overview.nav.group',
  navHidden: true,
  breadcrumb: [{ label: 'Upload centre', labelKey: 'cc_production.nav.upload', href: '/backend/upload' }, { label: 'Upload', labelKey: 'cc_production.nav.uploadRegister' }],
}
