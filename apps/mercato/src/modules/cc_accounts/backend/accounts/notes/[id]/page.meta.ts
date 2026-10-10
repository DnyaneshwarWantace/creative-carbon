export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_accounts.view'],
  pageTitle: 'Credit / debit note',
  pageTitleKey: 'cc_accounts.nav.note',
  pageGroup: 'Accounts',
  pageGroupKey: 'cc-02-accounts.nav.group',
  icon: 'receipt',
  navHidden: true,
  breadcrumb: [
    { label: 'Invoices', labelKey: 'cc_accounts.nav.invoices', href: '/backend/accounts/invoices' },
    { label: 'Credit / debit note', labelKey: 'cc_accounts.nav.note' },
  ],
}
