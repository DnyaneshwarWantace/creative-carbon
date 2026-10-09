import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['cc_accounts.*'],
    accounts: ['cc_accounts.view', 'cc_accounts.record', 'cc_accounts.tally'],
    sales: ['cc_accounts.view'],
    supervisor: ['cc_accounts.view'],
  },
}

export default setup
