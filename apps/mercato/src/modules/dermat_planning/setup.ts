import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['dermat_planning.*'],
    supervisor: ['dermat_planning.view', 'dermat_planning.reserve'],
    procurement: ['dermat_planning.view'],
    production_staff: ['dermat_planning.view'],
    pm_store: ['dermat_planning.view'],
    sales: ['dermat_planning.view'],
  },
}

export default setup
