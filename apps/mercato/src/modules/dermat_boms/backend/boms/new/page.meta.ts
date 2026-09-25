export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_boms.manage'],
  pageTitle: 'New BOM',
  pageTitleKey: 'dermat_boms.nav.new',
  pageGroup: 'R&D',
  pageGroupKey: 'dermat-03-rnd.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'BOM', labelKey: 'dermat_boms.nav.boms', href: '/backend/boms' },
    { label: 'New', labelKey: 'dermat_boms.nav.new' },
  ],
}
