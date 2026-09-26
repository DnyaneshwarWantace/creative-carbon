import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

const worker = ['dermat_dashboard.my_work']

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['dermat_dashboard.*'],
    supervisor: ['dermat_dashboard.view', 'dermat_dashboard.my_work', 'dermat_dashboard.everyone'],
    sales: worker,
    accounts: worker,
    research: worker,
    procurement: worker,
    production_staff: worker,
    operator: worker,
    quality_control: worker,
    quality_assurance: worker,
    pm_store: worker,
    employee: worker,
  },
}

export default setup
