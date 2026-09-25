export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_workflow.department.production'],
  pageTitle: 'Work Queue',
  pageTitleKey: 'dermat_workflow.nav.workQueue',
  pageGroup: 'Production',
  pageGroupKey: 'dermat-07-production.nav.group',
  pagePriority: 5,
  pageOrder: 1,
  icon: 'factory',
  breadcrumb: [{ label: 'Production — Work Queue', labelKey: 'dermat_workflow.queue.production.title' }],
} as const
