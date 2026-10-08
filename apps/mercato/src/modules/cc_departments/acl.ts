export const features = [
  { id: 'cc_departments.view', title: 'View departments', module: 'cc_departments' },
  {
    id: 'cc_departments.manage',
    title: 'Manage departments',
    module: 'cc_departments',
    dependsOn: ['cc_departments.view'],
  },
  { id: 'cc_departments.erp', title: 'Use the ERP (plant, store, purchase, accounts, order stages)', module: 'cc_departments' },
]

export default features
