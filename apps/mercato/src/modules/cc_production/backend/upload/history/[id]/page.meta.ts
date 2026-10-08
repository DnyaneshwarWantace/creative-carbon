export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_production.upload.use'],
  pageTitle: 'Upload',
  pageTitleKey: 'cc_production.nav.uploadOne',
  pageGroup: 'Overview',
  pageGroupKey: 'cc-00-overview.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Upload centre', labelKey: 'cc_production.nav.upload', href: '/backend/upload' },
    { label: 'History', labelKey: 'cc_production.nav.uploadHistory', href: '/backend/upload/history' },
    { label: 'Upload', labelKey: 'cc_production.nav.uploadOne' },
  ],
}
