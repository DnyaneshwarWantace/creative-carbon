import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'dermat_departments.*',
    ],
    employee: [
      'dermat_departments.view',
    ],
    sales: ['dermat_departments.view', 'perspectives.use'],
    procurement: ['dermat_departments.view', 'perspectives.use'],
    research: ['dermat_departments.view', 'perspectives.use'],
    production_staff: ['dermat_departments.view', 'perspectives.use'],
    supervisor: ['dermat_departments.view', 'perspectives.use'],
    operator: ['dermat_departments.view', 'perspectives.use'],
    quality_control: ['dermat_departments.view', 'perspectives.use'],
    quality_assurance: ['dermat_departments.view', 'perspectives.use'],
    pm_store: ['dermat_departments.view', 'perspectives.use'],
    accounts: ['dermat_departments.view', 'perspectives.use'],
  },
}

export default setup
