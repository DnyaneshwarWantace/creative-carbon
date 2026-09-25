import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { seedDermatProducts } from './lib/seeds'

export const setup: ModuleSetupConfig = {
  seedDefaults: async (ctx) => {
    await seedDermatProducts(ctx.em, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  },
}

export default setup
