export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_crm.team'],
  pageTitle: 'Pipeline stages',
  pageTitleKey: 'cc_crm.nav.stages',
  pageGroup: 'CRM',
  pageGroupKey: 'cc-01-crm.nav.group',
  pageOrder: 20,
  icon: 'list-ordered',
  breadcrumb: [
    { label: 'Pipeline board', labelKey: 'cc_crm.nav.pipeline', href: '/backend/crm/pipeline' },
    { label: 'Pipeline stages', labelKey: 'cc_crm.nav.stages' },
  ],
}
