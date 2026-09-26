export const features = [
  { id: 'dermat_purchase.view', title: 'View purchase orders and goods receiving', module: 'dermat_purchase' },
  { id: 'dermat_purchase.manage', title: 'Create and edit purchase orders', module: 'dermat_purchase', dependsOn: ['dermat_purchase.view'] },
  { id: 'dermat_purchase.approve', title: 'Approve purchase orders', module: 'dermat_purchase', dependsOn: ['dermat_purchase.view'] },
  { id: 'dermat_purchase.indent', title: 'Raise purchase indents (ask Purchase to buy material)', module: 'dermat_purchase', dependsOn: ['dermat_purchase.view'] },
  { id: 'dermat_purchase.receive', title: 'Receive goods (GRN) and return to vendor', module: 'dermat_purchase', dependsOn: ['dermat_purchase.view'] },
]

export default features
