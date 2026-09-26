import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['dermat_store.*'],
    pm_store: ['dermat_store.view', 'dermat_store.issue', 'dermat_store.adjust'],
    operator: ['dermat_store.view', 'dermat_store.request'],
    production_staff: ['dermat_store.view', 'dermat_store.request'],
    supervisor: ['dermat_store.view', 'dermat_store.request'],
    research: ['dermat_store.view', 'dermat_store.request'],
    procurement: ['dermat_store.view'],
    quality_control: ['dermat_store.view'],
    quality_assurance: ['dermat_store.view'],
    sales: ['dermat_store.view'],
    accounts: ['dermat_store.view'],
  },
}

export default setup
