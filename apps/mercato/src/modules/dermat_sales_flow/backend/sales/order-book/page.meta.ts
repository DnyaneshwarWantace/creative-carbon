export const metadata = {
  requireAuth: true,
  requireFeatures: ['sales.orders.view'],
  pageTitle: 'Orders',
  pageTitleKey: 'dermat_sales_flow.orderBook.list.title',
  pageGroup: 'Sales',
  pageGroupKey: 'dermat-01-sales.nav.group',
  pageOrder: 10,
  icon: 'receipt',
  breadcrumb: [{ label: 'Orders', labelKey: 'dermat_sales_flow.orderBook.list.title' }],
} as const
