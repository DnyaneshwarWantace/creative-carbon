import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['cc_lists.*'],
    employee: ['cc_lists.view'],
  },
}

export default setup
