export const metadata = {
  requireAuth: true,
  requireFeatures: ['cc_crm.view'],
  pageTitle: 'Salesperson',
  pageTitleKey: 'cc_crm.nav.person',
  pageGroup: 'CRM',
  pageGroupKey: 'cc-01-crm.nav.group',
  navHidden: true,
  breadcrumb: [{ label: 'Team', labelKey: 'cc_crm.nav.team', href: '/backend/crm/team' }, { label: 'Salesperson', labelKey: 'cc_crm.nav.person' }],
}
