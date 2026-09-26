import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

const worker = ['dermat_orders.view', 'dermat_orders.stages']

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['dermat_orders.*'],
    sales: ['dermat_orders.view', 'dermat_orders.manage', 'dermat_orders.stages'],
    accounts: [...worker, 'dermat_orders.work.accounts'],
    research: [...worker, 'dermat_orders.work.rnd'],
    procurement: [...worker, 'dermat_orders.work.planning'],
    pm_store: [...worker, 'dermat_orders.work.dispatch'],
    production_staff: [...worker, 'dermat_orders.work.production'],
    supervisor: [...worker, 'dermat_orders.work.planning', 'dermat_orders.work.production'],
    operator: [...worker, 'dermat_orders.work.production'],
    quality_control: ['dermat_orders.view'],
    quality_assurance: [...worker, 'dermat_orders.work.artwork', 'dermat_orders.work.qa'],
    employee: ['dermat_orders.view'],
  },
}

export default setup
