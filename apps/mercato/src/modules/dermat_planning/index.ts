import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'dermat_planning',
  title: 'Planning',
  version: '0.1.0',
  description: 'Dermat India planning: pick several orders or BOMs, see one combined material total, reserve stock per order without deducting it, clear or move reservations.',
  author: 'Wantace',
  license: 'UNLICENSED',
  ejectable: false,
}

export { features } from './acl'
