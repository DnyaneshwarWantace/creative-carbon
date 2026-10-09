export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_accounts.view'],
  pageTitle: 'Tally push',
  pageTitleKey: 'cc_accounts.nav.tallyPush',
  pageGroup: 'Accounts',
  pageGroupKey: 'cc-02-accounts.nav.group',
  icon: 'file-down',
  navHidden: true,
  breadcrumb: [
    { label: 'Tally', labelKey: 'cc_accounts.nav.tally', href: '/backend/accounts/tally' },
    { label: 'Tally push', labelKey: 'cc_accounts.nav.tallyPush' },
  ],
}
