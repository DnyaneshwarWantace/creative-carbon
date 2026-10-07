import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'cc_production',
  title: 'Plant',
  version: '0.1.0',
  description: 'Creative Carbon plant: reactors, dryers, presses, moulds and dies, loading tolerance, price lists, and the plant registers.',
  author: 'Wantace',
  license: 'UNLICENSED',
  ejectable: false,
}

export { features } from './acl'
