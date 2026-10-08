import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['cc_crm.*'],
    supervisor: ['cc_crm.view'],
    employee: ['cc_crm.view'],
  },
}

export default setup
