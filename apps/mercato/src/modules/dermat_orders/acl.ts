export const features = [
  { id: 'dermat_orders.view', title: 'View orders', module: 'dermat_orders' },
  { id: 'dermat_orders.manage', title: 'Create and edit orders', module: 'dermat_orders', dependsOn: ['dermat_orders.view'] },
  { id: 'dermat_orders.stages', title: 'Work on order stages', module: 'dermat_orders', dependsOn: ['dermat_orders.view'] },
]

export default features
