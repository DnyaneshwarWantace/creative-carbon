import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['cc_vendors.*'],
    employee: ['cc_vendors.view'],
    procurement: ['cc_vendors.view', 'cc_vendors.manage'],
    accounts: ['cc_vendors.view'],
    fg_store: ['cc_vendors.view'],
    supervisor: ['cc_vendors.view'],
    quality_control: ['cc_vendors.view'],
  },
}

export default setup
