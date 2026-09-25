import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { seedDermatSalesFlowDictionaries, seedDermatProductFieldsets } from './lib/seeds'

export const setup: ModuleSetupConfig = {
  seedDefaults: async (ctx) => {
    await seedDermatSalesFlowDictionaries(ctx.em, {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
    })
    await seedDermatProductFieldsets(ctx.em, {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
    })
  },
  defaultRoleFeatures: {
    sales: [
      'sales.orders.view',
      'sales.orders.manage',
      'catalog.products.view',
      'catalog.categories.view',
      'customers.people.view',
      'customers.people.manage',
      'customers.companies.view',
      'customers.companies.manage',
      'customers.deals.view',
      'customers.deals.manage',
      'customers.activities.view',
      'customers.activities.manage',
      'customers.pipelines.view',
    ],
    accounts: [
      'sales.orders.view',
      'customers.people.view',
      'customers.companies.view',
    ],
  },
}

export default setup
