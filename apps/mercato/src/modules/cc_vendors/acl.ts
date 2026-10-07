export const features = [
  { id: 'cc_vendors.view', title: 'View vendors', module: 'cc_vendors' },
  {
    id: 'cc_vendors.manage',
    title: 'Manage vendors',
    module: 'cc_vendors',
    dependsOn: ['cc_vendors.view'],
  },
]

export default features
