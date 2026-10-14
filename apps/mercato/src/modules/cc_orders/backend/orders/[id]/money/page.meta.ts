export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_orders.view', 'cc_accounts.view'],
  pageTitle: 'Order account',
  pageTitleKey: 'cc_orders.nav.account',
  pageGroup: 'Accounts',
  pageGroupKey: 'cc-02-accounts.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Payments & dues', labelKey: 'cc_accounts.nav.dues', href: '/backend/accounts/dues' },
    { label: 'Order account', labelKey: 'cc_orders.nav.account' },
  ],
}
