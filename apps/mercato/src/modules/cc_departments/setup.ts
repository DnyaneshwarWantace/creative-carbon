import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

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
}

export default setup
