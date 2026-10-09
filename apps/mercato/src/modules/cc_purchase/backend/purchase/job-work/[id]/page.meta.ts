export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_purchase.view'],
  pageTitle: 'Job-work challan',
  pageTitleKey: 'cc_purchase.nav.jobWorkChallan',
  pageGroup: 'Purchase',
  pageGroupKey: 'cc-05-purchase.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Job work', labelKey: 'cc_purchase.nav.jobWork', href: '/backend/purchase/job-work' },
    { label: 'Challan', labelKey: 'cc_purchase.nav.jobWorkChallan' },
  ],
}
