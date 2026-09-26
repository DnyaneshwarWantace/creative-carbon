import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['dermat_purchase.*'],
    procurement: ['dermat_purchase.view', 'dermat_purchase.manage', 'dermat_purchase.receive'],
    accounts: ['dermat_purchase.view', 'dermat_purchase.approve'],
    pm_store: ['dermat_purchase.view', 'dermat_purchase.receive'],
    supervisor: ['dermat_purchase.view', 'dermat_purchase.approve'],
    quality_control: ['dermat_purchase.view'],
    production_staff: ['dermat_purchase.view'],
  },
}

export default setup
