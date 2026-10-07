export const features = [
  { id: 'cc_lists.view', title: 'View dropdown lists', module: 'cc_lists' },
  { id: 'cc_lists.manage', title: 'Change dropdown lists', module: 'cc_lists', dependsOn: ['cc_lists.view'] },
]

export default features
