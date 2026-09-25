export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_workflow.department.planning'],
  pageTitle: 'Work Queue',
  pageTitleKey: 'dermat_workflow.nav.workQueue',
  pageGroup: 'Planning',
  pageGroupKey: 'dermat-04-planning.nav.group',
  pagePriority: 5,
  pageOrder: 1,
  icon: 'calendar',
  breadcrumb: [{ label: 'Planning — Work Queue', labelKey: 'dermat_workflow.queue.planning.title' }],
} as const
