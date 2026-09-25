export const metadata = {
  requireAuth: true,
  requireFeatures: ['dermat_workflow.department.planning'],
  pageTitle: 'Stock Reservation',
  pageTitleKey: 'dermat_workflow.reservation.pageTitle',
  pageGroup: 'Planning',
  pageGroupKey: 'dermat-04-planning.nav.group',
  pagePriority: 5,
  pageOrder: 3,
  icon: 'lock',
  breadcrumb: [{ label: 'Stock Reservation', labelKey: 'dermat_workflow.reservation.pageTitle' }],
} as const
