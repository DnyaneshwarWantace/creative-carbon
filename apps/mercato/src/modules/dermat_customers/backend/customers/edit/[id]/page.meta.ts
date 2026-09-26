export const metadata = {
  requireAuth: true,
  requireFeatures: ['customers.companies.manage'],
  pageTitle: 'Edit customer',
  pageTitleKey: 'dermat_customers.form.editTitle',
  pageGroup: 'Sales',
  pageGroupKey: 'dermat-01-sales.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Customer', labelKey: 'dermat_customers.nav.customer', href: '/backend/customers/companies' },
    { label: 'Edit', labelKey: 'dermat_customers.form.editTitle' },
  ],
}
