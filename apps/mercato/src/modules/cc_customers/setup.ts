import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    sales: ['customers.companies.view', 'customers.activities.view', 'customers.companies.manage', 'customers.people.view', 'customers.people.manage'],
    accounts: ['customers.companies.view', 'customers.activities.view'],
    supervisor: ['customers.companies.view', 'customers.activities.view'],
  },
}

export default setup
