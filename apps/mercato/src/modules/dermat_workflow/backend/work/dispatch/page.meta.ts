export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_workflow.department.dispatch'],
  pageTitle: 'Work Queue',
  pageTitleKey: 'dermat_workflow.nav.workQueue',
  pageGroup: 'Dispatch',
  pageGroupKey: 'dermat-10-dispatch.nav.group',
  pagePriority: 5,
  pageOrder: 1,
  icon: 'truck',
  breadcrumb: [{ label: 'Dispatch — Work Queue', labelKey: 'dermat_workflow.queue.dispatch.title' }],
} as const
