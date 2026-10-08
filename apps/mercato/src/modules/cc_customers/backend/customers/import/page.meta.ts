export const metadata = {
  requireAuth: true,
  requireFeatures: ['customers.companies.manage'],
  pageTitle: 'Import customers',
  pageTitleKey: 'cc_customers.import.titleCustomers',
  pageGroup: 'CRM',
  pageGroupKey: 'cc-01-crm.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Customer', labelKey: 'cc_customers.nav.customer', href: '/backend/customers/companies' },
    { label: 'Import customers', labelKey: 'cc_customers.import.titleCustomers' },
  ],
}
