export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_workflow.department.accounts'],
  pageTitle: 'Work Queue',
  pageTitleKey: 'dermat_workflow.nav.workQueue',
  pageGroup: 'Accounts',
  pageGroupKey: 'dermat-02-accounts.nav.group',
  pagePriority: 5,
  pageOrder: 1,
  icon: 'wallet',
  breadcrumb: [{ label: 'Accounts — Work Queue', labelKey: 'dermat_workflow.queue.accounts.title' }],
} as const
