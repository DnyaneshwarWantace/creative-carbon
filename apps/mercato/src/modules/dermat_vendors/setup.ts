import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['dermat_vendors.*'],
    employee: ['dermat_vendors.view'],
    procurement: ['dermat_vendors.view', 'dermat_vendors.manage'],
    accounts: ['dermat_vendors.view'],
    pm_store: ['dermat_vendors.view'],
    supervisor: ['dermat_vendors.view'],
    quality_control: ['dermat_vendors.view'],
  },
}

export default setup
