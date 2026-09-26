import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['dermat_quality.*'],
    quality_control: ['dermat_quality.view', 'dermat_quality.chemical', 'dermat_quality.micro', 'dermat_quality.rules'],
    quality_assurance: ['dermat_quality.view', 'dermat_quality.rules'],
    research: ['dermat_quality.view'],
    production_staff: ['dermat_quality.view'],
    operator: ['dermat_quality.view'],
    supervisor: ['dermat_quality.view'],
    procurement: ['dermat_quality.view'],
    pm_store: ['dermat_quality.view'],
  },
}

export default setup
