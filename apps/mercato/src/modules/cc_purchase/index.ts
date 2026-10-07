import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'cc_purchase',
  title: 'Purchase',
  version: '0.1.0',
  description: 'Creative Carbon Composites purchase: purchase orders with approval, goods receiving (GRN) against the PO into "under test" stock, inward QC that approves or rejects each batch, return to vendor.',
  author: 'Wantace',
  license: 'UNLICENSED',
  ejectable: false,
}

export { features } from './acl'
