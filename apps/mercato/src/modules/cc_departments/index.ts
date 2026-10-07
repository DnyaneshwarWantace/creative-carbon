import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'cc_departments',
  title: 'Departments',
  version: '0.1.0',
  description: 'Department master data (sales, purchase, production, quality, store, finance, admin).',
  author: 'Wantace',
  license: 'UNLICENSED',
  ejectable: false,
}

export { features } from './acl'
