import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'cc_crm',
  title: 'Enquiries & quotations',
  version: '0.1.0',
  description: 'Creative Carbon enquiries (IndiaMART, WhatsApp, email, phone, walk-in, referral), follow-ups and quotations that convert to orders.',
  author: 'Wantace',
  license: 'UNLICENSED',
  ejectable: false,
}

export { features } from './acl'
