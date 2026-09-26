import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['dermat_boms.*'],
    research: ['dermat_boms.view', 'dermat_boms.manage', 'dermat_boms.approve'],
    supervisor: ['dermat_boms.view'],
    production_staff: ['dermat_boms.view'],
    operator: ['dermat_boms.view'],
    procurement: ['dermat_boms.view'],
    pm_store: ['dermat_boms.view'],
    quality_control: ['dermat_boms.view'],
    quality_assurance: ['dermat_boms.view'],
  },
}

export default setup
