import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['dermat_rnd.*'],
    research: ['dermat_rnd.view', 'dermat_rnd.request', 'dermat_rnd.manage'],
    sales: ['dermat_rnd.view', 'dermat_rnd.request'],
    quality_assurance: ['dermat_rnd.view'],
    supervisor: ['dermat_rnd.view'],
  },
}

export default setup
