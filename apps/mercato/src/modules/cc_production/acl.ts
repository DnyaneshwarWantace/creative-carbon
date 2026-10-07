export const features = [
  { id: 'cc_production.masters.view', title: 'See plant masters (reactors, dryers, presses, moulds, tolerance)', module: 'cc_production' },
  { id: 'cc_production.masters.manage', title: 'Add and change plant masters, import the mould list', module: 'cc_production', dependsOn: ['cc_production.masters.view'] },
  { id: 'cc_production.upload.use', title: 'Use the upload centre (Excel templates and uploads of the registers)', module: 'cc_production' },
  { id: 'cc_production.prices.view', title: 'See price lists', module: 'cc_production' },
  { id: 'cc_production.prices.manage', title: 'Change price lists', module: 'cc_production', dependsOn: ['cc_production.prices.view'] },
]

export default features
