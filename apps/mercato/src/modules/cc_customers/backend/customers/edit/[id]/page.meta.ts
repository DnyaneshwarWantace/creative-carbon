export const metadata = {
  requireAuth: true,
  requireFeatures: ['customers.companies.manage'],
  pageTitle: 'Edit customer',
  pageTitleKey: 'cc_customers.form.editTitle',
  pageGroup: 'Sales',
  pageGroupKey: 'cc-01-sales.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Customer', labelKey: 'cc_customers.nav.customer', href: '/backend/customers/companies' },
    { label: 'Edit', labelKey: 'cc_customers.form.editTitle' },
  ],
}
