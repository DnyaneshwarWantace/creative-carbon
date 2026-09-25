export const metadata = {
  requireAuth: true,
  requireFeatures: ['catalog.products.manage'],
  pageTitle: 'Edit product',
  pageTitleKey: 'dermat_products.nav.edit',
  pageGroup: 'Masters',
  pageGroupKey: 'dermat-11-masters.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Products', labelKey: 'dermat_products.nav.products', href: '/backend/products' },
    { label: 'Edit', labelKey: 'dermat_products.nav.edit' },
  ],
}
