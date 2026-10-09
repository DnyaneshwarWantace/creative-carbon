export const features = [
  { id: 'cc_purchase.view', title: 'View purchase orders and goods receiving', module: 'cc_purchase' },
  { id: 'cc_purchase.manage', title: 'Create and edit purchase orders', module: 'cc_purchase', dependsOn: ['cc_purchase.view'] },
  { id: 'cc_purchase.approve', title: 'Approve purchase orders', module: 'cc_purchase', dependsOn: ['cc_purchase.view'] },
  { id: 'cc_purchase.indent', title: 'Raise purchase indents (ask Purchase to buy material)', module: 'cc_purchase', dependsOn: ['cc_purchase.view'] },
  { id: 'cc_purchase.receive', title: 'Receive goods (GRN) and return to vendor', module: 'cc_purchase', dependsOn: ['cc_purchase.view'] },
  { id: 'cc_purchase.jobwork', title: 'Send material to job workers and receive it back', module: 'cc_purchase', dependsOn: ['cc_purchase.view'] },
]

export default features
