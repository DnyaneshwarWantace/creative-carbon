export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_accounts.view'],
  pageTitle: 'Proforma invoice',
  pageTitleKey: 'dermat_accounts.nav.proforma',
  pageGroup: 'Accounts',
  pageGroupKey: 'dermat-02-accounts.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Proforma invoices', labelKey: 'dermat_accounts.nav.proformas', href: '/backend/accounts/proformas' },
    { label: 'Proforma invoice', labelKey: 'dermat_accounts.nav.proforma' },
  ],
}
