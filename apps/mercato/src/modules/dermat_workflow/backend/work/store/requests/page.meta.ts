export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_workflow.department.store'],
  pageTitle: 'Material Requests',
  pageTitleKey: 'dermat_workflow.requests.pageTitle',
  pageGroup: 'Store',
  pageGroupKey: 'dermat-06-store.nav.group',
  pagePriority: 5,
  pageOrder: 2,
  icon: 'clipboard-list',
  breadcrumb: [{ label: 'Material Requests', labelKey: 'dermat_workflow.requests.pageTitle' }],
} as const
