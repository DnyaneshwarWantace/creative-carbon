export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_bom.view'],
  pageTitle: 'BOM',
  pageTitleKey: 'dermat_bom.detail.title',
  pageGroup: 'Planning',
  pageGroupKey: 'dermat-04-planning.nav.group',
  icon: 'layers',
  breadcrumb: [
    { label: 'Bill of Materials', labelKey: 'dermat_bom.list.page.title', href: '/backend/dermat_bom' },
    { label: 'BOM', labelKey: 'dermat_bom.detail.title' },
  ],
}
