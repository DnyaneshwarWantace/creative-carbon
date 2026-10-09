export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_accounts.view'],
  pageTitle: 'Payment',
  pageTitleKey: 'cc_accounts.nav.payment',
  pageGroup: 'Accounts',
  pageGroupKey: 'cc-02-accounts.nav.group',
  icon: 'indian-rupee',
  navHidden: true,
  breadcrumb: [
    { label: 'Payments received', labelKey: 'cc_accounts.nav.payments', href: '/backend/accounts/payments' },
    { label: 'Payment', labelKey: 'cc_accounts.nav.payment' },
  ],
}
