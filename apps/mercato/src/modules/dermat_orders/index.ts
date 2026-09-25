import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'dermat_orders',
  title: 'Orders',
  version: '0.1.0',
  description: 'Dermat India sales orders: one-page order with stages from booking to dispatch.',
  author: 'Wantace',
  license: 'UNLICENSED',
  ejectable: false,
}

export { features } from './acl'
