export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_purchase.jobwork'],
  pageTitle: 'New job-work challan',
  pageTitleKey: 'cc_purchase.nav.jobWorkNew',
  pageGroup: 'Purchase',
  pageGroupKey: 'cc-05-purchase.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Job work', labelKey: 'cc_purchase.nav.jobWork', href: '/backend/purchase/job-work' },
    { label: 'New challan', labelKey: 'cc_purchase.nav.jobWorkNew' },
  ],
}
