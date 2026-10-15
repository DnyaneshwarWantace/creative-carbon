export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_purchase.view'],
  pageTitle: 'Indent',
  pageTitleKey: 'cc_purchase.nav.indent',
  pageGroup: 'Raw material',
  pageGroupKey: 'cc-06a-raw.nav.group',
  icon: 'clipboard-list',
  navHidden: true,
  breadcrumb: [
    { label: 'Purchase indents', labelKey: 'cc_purchase.nav.indents', href: '/backend/purchase/indents' },
    { label: 'Indent', labelKey: 'cc_purchase.nav.indent' },
  ],
}
