export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_workflow.department.sales'],
  pageTitle: 'Work Queue',
  pageTitleKey: 'dermat_workflow.nav.workQueue',
  pageGroup: 'Sales',
  pageGroupKey: 'dermat-01-sales.nav.group',
  pagePriority: 5,
  pageOrder: 1,
  icon: 'inbox',
  breadcrumb: [{ label: 'Sales — Work Queue', labelKey: 'dermat_workflow.queue.sales.title' }],
} as const
