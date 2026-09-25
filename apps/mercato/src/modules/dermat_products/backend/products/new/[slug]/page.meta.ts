export const metadata = {
  requireAuth: true,
  requireFeatures: ['catalog.products.manage'],
  pageTitle: 'New product',
  pageTitleKey: 'dermat_products.nav.newProduct',
  pageGroup: 'Masters',
  pageGroupKey: 'dermat-11-masters.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Products', labelKey: 'dermat_products.nav.products', href: '/backend/products' },
    { label: 'New', labelKey: 'dermat_products.nav.new' },
  ],
}
