import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'dermat_rnd',
  title: 'R&D requests',
  version: '0.1.0',
  description: 'R&D requests and samples for clients and new product development, with R&D numbers and sample rounds.',
  author: 'Wantace',
  license: 'UNLICENSED',
  ejectable: false,
}

export { features } from './acl'
