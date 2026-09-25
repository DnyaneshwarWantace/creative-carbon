import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'dermat_workflow',
  title: 'Order Workflow',
  version: '0.1.0',
  description: 'Stage engine for Dermat India: every order and every product batch moves through admin-configurable stages, completed from the order page or from each department\'s work page.',
  author: 'Wantace',
  license: 'UNLICENSED',
  ejectable: false,
}

export { features } from './acl'
