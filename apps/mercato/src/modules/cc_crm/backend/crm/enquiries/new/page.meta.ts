export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_crm.manage'],
  pageTitle: 'Log enquiry',
  pageTitleKey: 'cc_crm.nav.newEnquiry',
  pageGroup: 'Sales',
  pageGroupKey: 'cc-01-sales.nav.group',
  navHidden: true,
  breadcrumb: [{ label: 'Enquiries', labelKey: 'cc_crm.nav.enquiries', href: '/backend/crm/enquiries' }, { label: 'Log enquiry', labelKey: 'cc_crm.nav.newEnquiry' }],
}
