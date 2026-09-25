export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_workflow.department.rnd'],
  pageTitle: 'Work Queue',
  pageTitleKey: 'dermat_workflow.nav.workQueue',
  pageGroup: 'R&D',
  pageGroupKey: 'dermat-03-rnd.nav.group',
  pagePriority: 5,
  pageOrder: 1,
  icon: 'flask-conical',
  breadcrumb: [{ label: 'R&D — Work Queue', labelKey: 'dermat_workflow.queue.rnd.title' }],
} as const
