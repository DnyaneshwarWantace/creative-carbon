import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { seedDermatProducts } from './lib/seeds'

const productViewers = ['sales', 'accounts', 'pm_store', 'production_staff', 'supervisor', 'operator', 'quality_control', 'quality_assurance']

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    ...Object.fromEntries(productViewers.map((role) => [role, ['catalog.products.view', 'catalog.categories.view']])),
    research: ['catalog.products.view', 'catalog.categories.view', 'catalog.products.manage'],
    procurement: ['catalog.products.view', 'catalog.categories.view', 'catalog.products.manage'],
  },
  seedDefaults: async (ctx) => {
    await seedDermatProducts(ctx.em, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  },
}

export default setup
