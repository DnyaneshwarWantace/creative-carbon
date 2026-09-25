export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_workflow.stages.manage'],
  pageTitle: 'Workflow Stages',
  pageTitleKey: 'dermat_workflow.stages.title',
  pageGroup: 'Masters',
  pageGroupKey: 'dermat-11-masters.nav.group',
  pagePriority: 90,
  pageOrder: 90,
  icon: 'workflow',
  breadcrumb: [{ label: 'Workflow Stages', labelKey: 'dermat_workflow.stages.title' }],
} as const
