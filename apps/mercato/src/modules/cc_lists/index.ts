import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'cc_lists',
  title: 'Dropdown lists',
  version: '0.1.0',
  description: 'One place to manage the choices in every Creative Carbon dropdown (payment modes, shifts, designer statuses, spec choices and more).',
  author: 'Wantace',
  license: 'UNLICENSED',
  ejectable: false,
}

export { features } from './acl'
