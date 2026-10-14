import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['cc_accounts.*'],
    accounts: ['cc_accounts.view', 'cc_accounts.record', 'cc_accounts.tally', 'cc_accounts.credit_note', 'cc_accounts.logos'],
    sales: ['cc_accounts.view', 'cc_accounts.logos'],
    supervisor: ['cc_accounts.view'],
  },
}

export default setup
