export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_workflow.department.store'],
  pageTitle: 'Work Queue',
  pageTitleKey: 'dermat_workflow.nav.workQueue',
  pageGroup: 'Store',
  pageGroupKey: 'dermat-06-store.nav.group',
  pagePriority: 5,
  pageOrder: 1,
  icon: 'warehouse',
  breadcrumb: [{ label: 'Store — Work Queue', labelKey: 'dermat_workflow.queue.store.title' }],
} as const
