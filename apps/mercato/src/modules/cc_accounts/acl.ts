export const features = [
  { id: 'cc_accounts.view', title: 'See payments and dues', module: 'cc_accounts' },
  { id: 'cc_accounts.record', title: 'Record and void payments', module: 'cc_accounts', dependsOn: ['cc_accounts.view'] },
  { id: 'cc_accounts.series', title: 'Change document number series', module: 'cc_accounts' },
  { id: 'cc_accounts.tally', title: 'Send entries to Tally and change the Tally settings', module: 'cc_accounts', dependsOn: ['cc_accounts.view'] },
]

export default features
