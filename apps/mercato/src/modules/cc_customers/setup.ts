import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    sales: ['customers.companies.view', 'customers.companies.manage', 'customers.people.view', 'customers.people.manage'],
    accounts: ['customers.companies.view'],
    supervisor: ['customers.companies.view'],
  },
}

export default setup
