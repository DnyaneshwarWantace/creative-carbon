export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_workflow.department.planning'],
  pageTitle: 'Production Plans',
  pageTitleKey: 'dermat_workflow.plans.pageTitle',
  pageGroup: 'Planning',
  pageGroupKey: 'dermat-04-planning.nav.group',
  pagePriority: 5,
  pageOrder: 2,
  icon: 'layers',
  breadcrumb: [{ label: 'Production Plans', labelKey: 'dermat_workflow.plans.pageTitle' }],
} as const
