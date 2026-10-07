import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { seedCcDepartments } from './lib/seedDepartments'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'cc_departments.*',
    ],
    employee: [
      'cc_departments.view',
    ],
    sales: ['cc_departments.view', 'perspectives.use'],
    procurement: ['cc_departments.view', 'perspectives.use'],
    supervisor: ['cc_departments.view', 'perspectives.use'],
    quality_control: ['cc_departments.view', 'perspectives.use'],
    fg_store: ['cc_departments.view', 'perspectives.use'],
    accounts: ['cc_departments.view', 'perspectives.use'],
  },
  seedDefaults: async (ctx) => {
    await seedCcDepartments(ctx.em, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  },
}

export default setup
