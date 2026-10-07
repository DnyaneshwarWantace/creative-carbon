import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

const worker = ['cc_dashboard.my_work']

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['cc_dashboard.*'],
    supervisor: ['cc_dashboard.view', 'cc_dashboard.my_work', 'cc_dashboard.everyone'],
    sales: worker,
    accounts: worker,
    procurement: worker,
    quality_control: worker,
    fg_store: worker,
    employee: worker,
  },
}

export default setup
