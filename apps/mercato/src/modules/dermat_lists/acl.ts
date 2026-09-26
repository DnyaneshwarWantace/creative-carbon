export const features = [
  { id: 'dermat_lists.view', title: 'View dropdown lists', module: 'dermat_lists' },
  { id: 'dermat_lists.manage', title: 'Change dropdown lists', module: 'dermat_lists', dependsOn: ['dermat_lists.view'] },
]

export default features
