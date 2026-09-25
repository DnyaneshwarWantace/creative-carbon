export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_boms.view'],
  pageTitle: 'BOM',
  pageTitleKey: 'dermat_boms.nav.bom',
  pageGroup: 'R&D',
  pageGroupKey: 'dermat-03-rnd.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'BOM', labelKey: 'dermat_boms.nav.boms', href: '/backend/boms' },
    { label: 'Detail', labelKey: 'dermat_boms.nav.bom' },
  ],
}
