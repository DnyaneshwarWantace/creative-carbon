export const features = [
  { id: 'dermat_accounts.view', title: 'See payments and dues', module: 'dermat_accounts' },
  { id: 'dermat_accounts.record', title: 'Record and void payments', module: 'dermat_accounts', dependsOn: ['dermat_accounts.view'] },
]

export default features
