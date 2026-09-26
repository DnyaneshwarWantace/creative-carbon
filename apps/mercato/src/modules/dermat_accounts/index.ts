import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'dermat_accounts',
  title: 'Accounts',
  version: '0.1.0',
  description: 'Dermat India accounts: payments received against orders (advance and balance), dues per order, dispatch check on unpaid balance.',
  author: 'Wantace',
  license: 'UNLICENSED',
  ejectable: false,
}

export { features } from './acl'
