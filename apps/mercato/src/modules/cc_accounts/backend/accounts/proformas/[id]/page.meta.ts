export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_accounts.view'],
  pageTitle: 'Proforma invoice',
  pageTitleKey: 'cc_accounts.nav.proforma',
  pageGroup: 'Accounts',
  pageGroupKey: 'cc-02-accounts.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Proforma invoices', labelKey: 'cc_accounts.nav.proformas', href: '/backend/accounts/proformas' },
    { label: 'Proforma invoice', labelKey: 'cc_accounts.nav.proforma' },
  ],
}
