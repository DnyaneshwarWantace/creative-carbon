import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'cc_audit',
  title: 'Activity log',
  version: '0.1.0',
  description: 'Creative Carbon Composites activity log: who did what, when and why on every record, with old → new values, shown as one timeline on every detail page.',
  author: 'Wantace',
  license: 'UNLICENSED',
  ejectable: false,
}

export { features } from './acl'
