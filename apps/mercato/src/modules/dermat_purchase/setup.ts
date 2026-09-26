import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['dermat_purchase.*'],
    procurement: ['dermat_purchase.view', 'dermat_purchase.manage', 'dermat_purchase.receive', 'dermat_purchase.indent'],
    accounts: ['dermat_purchase.view', 'dermat_purchase.approve'],
    pm_store: ['dermat_purchase.view', 'dermat_purchase.receive', 'dermat_purchase.indent'],
    supervisor: ['dermat_purchase.view', 'dermat_purchase.approve', 'dermat_purchase.indent'],
    research: ['dermat_purchase.view', 'dermat_purchase.indent'],
    quality_control: ['dermat_purchase.view'],
    quality_assurance: ['dermat_purchase.view'],
    production_staff: ['dermat_purchase.view', 'dermat_purchase.indent'],
  },
}

export default setup
