export const features = [
  { id: 'cc_departments.view', title: 'View departments', module: 'cc_departments' },
  {
    id: 'cc_departments.manage',
    title: 'Manage departments',
    module: 'cc_departments',
    dependsOn: ['cc_departments.view'],
  },
]

export default features
