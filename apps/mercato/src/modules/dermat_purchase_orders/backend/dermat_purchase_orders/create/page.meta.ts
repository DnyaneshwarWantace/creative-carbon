export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_purchase_orders.manage'],
  pageTitle: 'New Purchase Order',
  pageTitleKey: 'dermat_purchase_orders.create.title',
  pageGroup: 'Purchase',
  pageGroupKey: 'dermat-05-purchase.nav.group',
  icon: 'shopping-cart',
  breadcrumb: [
    { label: 'Purchase Orders', labelKey: 'dermat_purchase_orders.list.title', href: '/backend/dermat_purchase_orders' },
    { label: 'New Purchase Order', labelKey: 'dermat_purchase_orders.create.title' },
  ],
}
