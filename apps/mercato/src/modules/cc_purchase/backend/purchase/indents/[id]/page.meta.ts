export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_purchase.view'],
  pageTitle: 'Indent',
  pageTitleKey: 'cc_purchase.nav.indent',
  pageGroup: 'Purchase',
  pageGroupKey: 'cc-05-purchase.nav.group',
  icon: 'clipboard-list',
  navHidden: true,
  breadcrumb: [
    { label: 'Purchase indents', labelKey: 'cc_purchase.nav.indents', href: '/backend/purchase/indents' },
    { label: 'Indent', labelKey: 'cc_purchase.nav.indent' },
  ],
}
