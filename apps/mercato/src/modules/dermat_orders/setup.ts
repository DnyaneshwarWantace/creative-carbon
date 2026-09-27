import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

const worker = ['dermat_orders.view', 'dermat_orders.stages', 'attachments.view', 'attachments.manage']

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['dermat_orders.*'],
    sales: ['dermat_orders.view', 'dermat_orders.manage', 'dermat_orders.money', 'dermat_orders.stages', 'attachments.view', 'attachments.manage'],
    accounts: [...worker, 'dermat_orders.money', 'dermat_orders.work.accounts'],
    research: [...worker, 'dermat_orders.work.rnd'],
    procurement: [...worker, 'dermat_orders.work.planning'],
    pm_store: [...worker, 'dermat_orders.work.dispatch'],
    production_staff: [...worker, 'dermat_orders.work.production'],
    supervisor: [...worker, 'dermat_orders.work.planning', 'dermat_orders.work.production'],
    operator: [...worker, 'dermat_orders.work.production'],
    quality_control: ['dermat_orders.view', 'attachments.view', 'attachments.manage'],
    quality_assurance: [...worker, 'dermat_orders.work.artwork', 'dermat_orders.work.qa'],
    employee: ['dermat_orders.view', 'attachments.view'],
  },
}

export default setup
