export const features = [
  { id: 'cc_store.view', title: 'View stock, lots and the stock ledger', module: 'cc_store' },
  { id: 'cc_store.adjust', title: 'Add or remove stock by hand (opening stock, count differences, damage)', module: 'cc_store', dependsOn: ['cc_store.view'] },
  { id: 'cc_store.approve', title: 'Approve hand adjustments and count differences', module: 'cc_store', dependsOn: ['cc_store.view'] },
]

export default features
