export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_accounts.view', 'cc_purchase.view'],
  pageTitle: 'Vendor bill',
  pageTitleKey: 'cc_accounts.nav.vendorBill',
  pageGroup: 'Accounts',
  pageGroupKey: 'cc-02-accounts.nav.group',
  icon: 'receipt',
  navHidden: true,
  breadcrumb: [
    { label: 'Vendor bills & payments', labelKey: 'cc_accounts.nav.vendorBills', href: '/backend/accounts/vendor-bills' },
    { label: 'Vendor bill', labelKey: 'cc_accounts.nav.vendorBill' },
  ],
}
