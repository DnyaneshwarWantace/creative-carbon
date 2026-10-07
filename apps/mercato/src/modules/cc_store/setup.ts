import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['cc_store.*'],
    fg_store: ['cc_store.view', 'cc_store.adjust'],
    supervisor: ['cc_store.view'],
    quality_control: ['cc_store.view'],
    sales: ['cc_store.view'],
    accounts: ['cc_store.view'],
  },
}

export default setup
