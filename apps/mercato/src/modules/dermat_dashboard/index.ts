import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'dermat_dashboard',
  title: 'Overview',
  version: '0.1.0',
  description: 'Dermat India overview: where every order is, what is stuck and with whom, materials below minimum, and each person\'s pending work (also sent as a morning email).',
  author: 'Wantace',
  license: 'UNLICENSED',
  ejectable: false,
}

export { features } from './acl'
