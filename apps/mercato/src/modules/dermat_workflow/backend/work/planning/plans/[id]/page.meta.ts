export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_workflow.department.planning'],
  pageTitle: 'Production Plan',
  pageTitleKey: 'dermat_workflow.plan.title',
  pageGroup: 'Planning',
  pageGroupKey: 'dermat-04-planning.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Production Plans', labelKey: 'dermat_workflow.plans.pageTitle', href: '/backend/work/planning/plans' },
    { label: 'Plan', labelKey: 'dermat_workflow.plan.title' },
  ],
} as const
