export const features = [
  { id: 'cc_crm.view', title: 'See enquiries and quotations', module: 'cc_crm' },
  { id: 'cc_crm.manage', title: 'Enter and follow up enquiries, make and send quotations', module: 'cc_crm', dependsOn: ['cc_crm.view'] },
  { id: 'cc_crm.convert', title: 'Convert a quotation to an order', module: 'cc_crm', dependsOn: ['cc_crm.view'] },
  { id: 'cc_crm.team', title: 'Manage the CRM team (add sales users, give or remove CRM roles)', module: 'cc_crm', dependsOn: ['cc_crm.view'] },
]

export default features
