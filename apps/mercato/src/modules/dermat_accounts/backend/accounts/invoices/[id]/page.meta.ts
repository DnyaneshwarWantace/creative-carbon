export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_accounts.view'],
  pageTitle: 'Invoice',
  pageTitleKey: 'dermat_accounts.nav.invoice',
  pageGroup: 'Accounts',
  pageGroupKey: 'dermat-02-accounts.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Invoices', labelKey: 'dermat_accounts.nav.invoices', href: '/backend/accounts/invoices' },
    { label: 'Invoice', labelKey: 'dermat_accounts.nav.invoice' },
  ],
}
