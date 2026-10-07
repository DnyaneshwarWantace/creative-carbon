import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

const worker = ['cc_orders.view', 'cc_orders.stages', 'attachments.view', 'attachments.manage']

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['cc_orders.*'],
    sales: ['cc_orders.view', 'cc_orders.full', 'cc_orders.manage', 'cc_orders.money', 'cc_orders.stages', 'attachments.view', 'attachments.manage'],
    accounts: [...worker, 'cc_orders.money', 'cc_orders.work.accounts'],
    fg_store: [...worker, 'cc_orders.work.store', 'cc_orders.work.dispatch'],
    quality_control: [...worker, 'cc_orders.work.qc'],
    supervisor: [...worker, 'cc_orders.full'],
    employee: ['cc_orders.view', 'attachments.view'],
  },
}

export default setup
