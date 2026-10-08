export const features = [
  { id: 'cc_production.masters.view', title: 'See plant masters (reactors, dryers, presses, moulds, tolerance)', module: 'cc_production' },
  { id: 'cc_production.masters.manage', title: 'Add and change plant masters, import the mould list', module: 'cc_production', dependsOn: ['cc_production.masters.view'] },
  { id: 'cc_production.upload.use', title: 'Use the upload centre (Excel templates and uploads of the registers)', module: 'cc_production' },
  { id: 'cc_production.prices.view', title: 'See price lists', module: 'cc_production' },
  { id: 'cc_production.resin.view', title: 'See resin batches and the chemical register', module: 'cc_production' },
  { id: 'cc_production.resin.enter', title: 'Enter, post and reopen resin batches', module: 'cc_production', dependsOn: ['cc_production.resin.view'] },
  { id: 'cc_production.resin.sign', title: 'Sign resin batches as chemist or in-charge', module: 'cc_production', dependsOn: ['cc_production.resin.view'] },
  { id: 'cc_production.chemicals.issue', title: 'Issue chemicals outside resin batches (methanol, DBP, oleic acid)', module: 'cc_production', dependsOn: ['cc_production.resin.view'] },
  { id: 'cc_production.coating.view', title: 'See dryer sheets and the B-stage board', module: 'cc_production' },
  { id: 'cc_production.coating.enter', title: 'Enter, post and reopen dryer sheets', module: 'cc_production', dependsOn: ['cc_production.coating.view'] },
  { id: 'cc_production.bstage.manage', title: 'Scrap B-stage lots', module: 'cc_production', dependsOn: ['cc_production.coating.view'] },
  { id: 'cc_production.prices.manage', title: 'Change price lists', module: 'cc_production', dependsOn: ['cc_production.prices.view'] },
]

export default features
