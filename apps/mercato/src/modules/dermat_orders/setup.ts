import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

const worker = ['dermat_orders.view', 'dermat_orders.stages']

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['dermat_orders.*'],
    sales: ['dermat_orders.view', 'dermat_orders.manage', 'dermat_orders.stages'],
    accounts: worker,
    research: worker,
    procurement: worker,
    pm_store: worker,
    production_staff: worker,
    supervisor: worker,
    quality_control: worker,
    quality_assurance: worker,
    employee: ['dermat_orders.view'],
  },
}

export default setup
