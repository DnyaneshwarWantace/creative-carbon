export const features = [
  { id: 'dermat_orders.view', title: 'View orders', module: 'dermat_orders' },
  { id: 'dermat_orders.manage', title: 'Create and edit orders', module: 'dermat_orders', dependsOn: ['dermat_orders.view'] },
  { id: 'dermat_orders.money', title: 'See order prices, totals and payments', module: 'dermat_orders', dependsOn: ['dermat_orders.view'] },
  { id: 'dermat_orders.stages', title: 'Work on order stages', module: 'dermat_orders', dependsOn: ['dermat_orders.view'] },
  { id: 'dermat_orders.work.accounts', title: 'Accounts work: advance and billing stages', module: 'dermat_orders', dependsOn: ['dermat_orders.stages'] },
  { id: 'dermat_orders.work.rnd', title: 'R&D work: sampling and formula stages', module: 'dermat_orders', dependsOn: ['dermat_orders.stages'] },
  { id: 'dermat_orders.work.artwork', title: 'Artwork & packaging stage', module: 'dermat_orders', dependsOn: ['dermat_orders.stages'] },
  { id: 'dermat_orders.work.planning', title: 'Material planning stage', module: 'dermat_orders', dependsOn: ['dermat_orders.stages'] },
  { id: 'dermat_orders.work.production', title: 'Production work: manufacturing, filling and packing stages', module: 'dermat_orders', dependsOn: ['dermat_orders.stages'] },
  { id: 'dermat_orders.work.qa', title: 'QA release stage', module: 'dermat_orders', dependsOn: ['dermat_orders.stages'] },
  { id: 'dermat_orders.work.dispatch', title: 'Dispatch stage', module: 'dermat_orders', dependsOn: ['dermat_orders.stages'] },
  { id: 'dermat_orders.reopen', title: 'Reopen any finished stage after its time limit (manager)', module: 'dermat_orders', dependsOn: ['dermat_orders.view'] },
  { id: 'dermat_orders.settings', title: 'Change workflow stages (names, steps, fields, documents, day limits)', module: 'dermat_orders', dependsOn: ['dermat_orders.view'] },
]

export default features
