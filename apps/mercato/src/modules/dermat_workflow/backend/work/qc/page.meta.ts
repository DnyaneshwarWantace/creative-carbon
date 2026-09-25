export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_workflow.department.qc'],
  pageTitle: 'Work Queue',
  pageTitleKey: 'dermat_workflow.nav.workQueue',
  pageGroup: 'Quality Control',
  pageGroupKey: 'dermat-08-qc.nav.group',
  pagePriority: 5,
  pageOrder: 1,
  icon: 'test-tube',
  breadcrumb: [{ label: 'Quality Control — Work Queue', labelKey: 'dermat_workflow.queue.qc.title' }],
} as const
