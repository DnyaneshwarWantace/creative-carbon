import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'dermat_quality',
  title: 'QC',
  version: '0.1.0',
  description: 'Dermat India quality control: QC rules per operation and product, QC checks with chemical and micro approvals.',
  author: 'Wantace',
  license: 'UNLICENSED',
  ejectable: false,
}

export { features } from './acl'
