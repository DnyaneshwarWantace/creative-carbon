import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'cc_orders',
  title: 'Orders',
  version: '0.1.0',
  description: 'Creative Carbon Composites sales orders: one-page order with stages from booking to dispatch.',
  author: 'Wantace',
  license: 'UNLICENSED',
  ejectable: false,
}

export { features } from './acl'
