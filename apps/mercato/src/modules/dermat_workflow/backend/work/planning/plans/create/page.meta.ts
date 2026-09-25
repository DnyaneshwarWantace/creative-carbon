export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_workflow.department.planning'],
  pageTitle: 'New Production Plan',
  pageTitleKey: 'dermat_workflow.plan.newTitle',
  pageGroup: 'Planning',
  pageGroupKey: 'dermat-04-planning.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Production Plans', labelKey: 'dermat_workflow.plans.pageTitle', href: '/backend/work/planning/plans' },
    { label: 'New plan', labelKey: 'dermat_workflow.plan.newCrumb' },
  ],
} as const
