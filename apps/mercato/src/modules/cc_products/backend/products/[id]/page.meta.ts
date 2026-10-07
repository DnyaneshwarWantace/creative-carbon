export const metadata = {
  requireAuth: true,
  requireFeatures: ['catalog.products.view'],
  pageTitle: 'Product',
  pageTitleKey: 'cc_products.nav.product',
  pageGroup: 'Masters',
  pageGroupKey: 'cc-11-masters.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Products', labelKey: 'cc_products.nav.products', href: '/backend/products' },
    { label: 'Product', labelKey: 'cc_products.nav.product' },
  ],
}
