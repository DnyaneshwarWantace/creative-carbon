import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { seedPlantMasters } from './lib/seeds'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['cc_production.*'],
    supervisor: ['cc_production.masters.view', 'cc_production.masters.manage', 'cc_production.resin.view', 'cc_production.resin.enter', 'cc_production.resin.sign', 'cc_production.chemicals.issue', 'cc_production.coating.view', 'cc_production.coating.enter', 'cc_production.bstage.manage', 'cc_production.press.view', 'cc_production.press.enter', 'cc_production.press.review', 'cc_production.moulding.view', 'cc_production.moulding.enter', 'cc_production.moulding.sign'],
    employee: ['cc_production.masters.view', 'cc_production.resin.view', 'cc_production.coating.view', 'cc_production.press.view', 'cc_production.moulding.view'],
  },
  seedDefaults: async (ctx) => {
    await seedPlantMasters(ctx.em, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  },
}

export default setup
