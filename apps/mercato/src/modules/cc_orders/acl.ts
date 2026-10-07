export const features = [
  { id: 'cc_orders.view', title: 'View orders', module: 'cc_orders' },
  { id: 'cc_orders.manage', title: 'Create and edit orders', module: 'cc_orders', dependsOn: ['cc_orders.view'] },
  { id: 'cc_orders.full', title: 'Open the full order: every stage and its details (others see only their own stages)', module: 'cc_orders', dependsOn: ['cc_orders.view'] },
  { id: 'cc_orders.money', title: 'See order prices, totals and payments', module: 'cc_orders', dependsOn: ['cc_orders.view'] },
  { id: 'cc_orders.stages', title: 'Work on order stages', module: 'cc_orders', dependsOn: ['cc_orders.view'] },
  { id: 'cc_orders.work.accounts', title: 'Accounts work: advance / LC and invoice stages', module: 'cc_orders', dependsOn: ['cc_orders.stages'] },
  { id: 'cc_orders.work.store', title: 'FG store work: stock allocation stage', module: 'cc_orders', dependsOn: ['cc_orders.stages'] },
  { id: 'cc_orders.work.qc', title: 'QC & lab work: QC and test report stage', module: 'cc_orders', dependsOn: ['cc_orders.stages'] },
  { id: 'cc_orders.work.dispatch', title: 'Despatch work: packing, weighment and despatch stages', module: 'cc_orders', dependsOn: ['cc_orders.stages'] },
  { id: 'cc_orders.reopen', title: 'Reopen any finished stage after its time limit (manager)', module: 'cc_orders', dependsOn: ['cc_orders.view'] },
  { id: 'cc_orders.settings', title: 'Change workflow stages (names, steps, fields, documents, day limits)', module: 'cc_orders', dependsOn: ['cc_orders.view'] },
]

export default features
