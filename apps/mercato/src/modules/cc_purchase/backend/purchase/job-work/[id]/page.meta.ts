export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_purchase.view'],
  pageTitle: 'Job-work challan',
  pageTitleKey: 'cc_purchase.nav.jobWorkChallan',
  pageGroup: 'Raw material',
  pageGroupKey: 'cc-06a-raw.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Job work', labelKey: 'cc_purchase.nav.jobWork', href: '/backend/purchase/job-work' },
    { label: 'Challan', labelKey: 'cc_purchase.nav.jobWorkChallan' },
  ],
}
