import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'dermat_boms',
  title: 'BOM',
  version: '0.1.0',
  description: 'Bill of Materials for Dermat India: bulk formulas in RM % and finished-good pack BOMs per piece.',
  author: 'Wantace',
  license: 'UNLICENSED',
  ejectable: false,
}

export { features } from './acl'
