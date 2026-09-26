import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['dermat_accounts.*'],
    accounts: ['dermat_accounts.view', 'dermat_accounts.record'],
    sales: ['dermat_accounts.view'],
    supervisor: ['dermat_accounts.view'],
  },
}

export default setup
