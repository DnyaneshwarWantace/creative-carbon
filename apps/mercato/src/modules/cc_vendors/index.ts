import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'cc_vendors',
  title: 'Vendors',
  version: '0.1.0',
  description: 'Vendor/supplier master data for Creative Carbon Composites (chemical, reinforcement and consumable suppliers, GST, contact and payment terms).',
  author: 'Wantace',
  license: 'UNLICENSED',
  ejectable: false,
}

export { features } from './acl'
