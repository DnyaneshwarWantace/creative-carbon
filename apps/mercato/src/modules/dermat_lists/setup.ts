import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['dermat_lists.*'],
    employee: ['dermat_lists.view'],
  },
}

export default setup
