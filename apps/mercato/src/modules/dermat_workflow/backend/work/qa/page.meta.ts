export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_workflow.department.qa'],
  pageTitle: 'Work Queue',
  pageTitleKey: 'dermat_workflow.nav.workQueue',
  pageGroup: 'Quality Assurance',
  pageGroupKey: 'dermat-09-qa.nav.group',
  pagePriority: 5,
  pageOrder: 1,
  icon: 'shield-check',
  breadcrumb: [{ label: 'Quality Assurance — Work Queue', labelKey: 'dermat_workflow.queue.qa.title' }],
} as const
