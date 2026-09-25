export const features = [
  { id: 'dermat_store.view', title: 'View store requests', module: 'dermat_store' },
  { id: 'dermat_store.request', title: 'Ask the store for material, confirm receipt, return leftover', module: 'dermat_store', dependsOn: ['dermat_store.view'] },
  { id: 'dermat_store.issue', title: 'Issue material from the store', module: 'dermat_store', dependsOn: ['dermat_store.view'] },
]

export default features
