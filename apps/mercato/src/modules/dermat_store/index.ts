import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'dermat_store',
  title: 'Store requests',
  version: '0.1.0',
  description: 'Dermat India store requests: production asks the RM / PM store for material, the store issues it, production confirms receipt, and stock moves automatically.',
  author: 'Wantace',
  license: 'UNLICENSED',
  ejectable: false,
}

export { features } from './acl'
