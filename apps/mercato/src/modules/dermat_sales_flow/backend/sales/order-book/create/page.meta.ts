export const metadata = {
  requireAuth: true,
  requireFeatures: ['sales.orders.manage'],
  pageTitle: 'New Order',
  pageTitleKey: 'dermat_sales_flow.orderBook.create.title',
  pageGroup: 'Sales',
  pageGroupKey: 'dermat-01-sales.nav.group',
  breadcrumb: [
    { label: 'Orders', labelKey: 'dermat_sales_flow.orderBook.list.title', href: '/backend/sales/order-book' },
    { label: 'New Order', labelKey: 'dermat_sales_flow.orderBook.create.title' },
  ],
} as const
