export const metadata = {
  requireAuth: true,
  requireFeatures: ['catalog.products.manage'],
  pageTitle: 'New product',
  pageTitleKey: 'cc_products.nav.newProduct',
  pageGroup: 'Masters',
  pageGroupKey: 'cc-11-masters.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Products', labelKey: 'cc_products.nav.products', href: '/backend/products' },
    { label: 'New', labelKey: 'cc_products.nav.new' },
  ],
}
