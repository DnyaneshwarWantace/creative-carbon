import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { seedCcProducts } from './lib/seeds'

const productViewers = ['sales', 'accounts', 'fg_store', 'supervisor', 'quality_control']

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    ...Object.fromEntries(productViewers.map((role) => [role, ['catalog.products.view', 'catalog.categories.view']])),
    procurement: ['catalog.products.view', 'catalog.categories.view', 'catalog.products.manage'],
  },
  seedDefaults: async (ctx) => {
    await seedCcProducts(ctx.em, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  },
}

export default setup
