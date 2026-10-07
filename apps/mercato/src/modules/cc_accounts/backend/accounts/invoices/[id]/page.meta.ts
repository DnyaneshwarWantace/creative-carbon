export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_accounts.view'],
  pageTitle: 'Invoice',
  pageTitleKey: 'cc_accounts.nav.invoice',
  pageGroup: 'Accounts',
  pageGroupKey: 'cc-02-accounts.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Invoices', labelKey: 'cc_accounts.nav.invoices', href: '/backend/accounts/invoices' },
    { label: 'Invoice', labelKey: 'cc_accounts.nav.invoice' },
  ],
}
