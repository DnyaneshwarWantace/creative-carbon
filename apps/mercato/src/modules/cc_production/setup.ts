import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { seedPlantMasters } from './lib/seeds'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['cc_production.*'],
    supervisor: ['cc_production.masters.view', 'cc_production.masters.manage', 'cc_production.resin.view', 'cc_production.resin.enter', 'cc_production.resin.sign', 'cc_production.chemicals.issue'],
    employee: ['cc_production.masters.view', 'cc_production.resin.view'],
  },
  seedDefaults: async (ctx) => {
    await seedPlantMasters(ctx.em, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  },
}

export default setup
