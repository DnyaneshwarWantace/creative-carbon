export const metadata = {
  requireAuth: true,
  requireFeatures: ['catalog.products.manage'],
  pageTitle: 'Edit product',
  pageTitleKey: 'cc_products.nav.edit',
  pageGroup: 'Masters',
  pageGroupKey: 'cc-11-masters.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Products', labelKey: 'cc_products.nav.products', href: '/backend/products' },
    { label: 'Edit', labelKey: 'cc_products.nav.edit' },
  ],
}
