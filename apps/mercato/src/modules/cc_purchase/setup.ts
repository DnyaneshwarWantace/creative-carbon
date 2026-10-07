import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['cc_purchase.*'],
    procurement: ['cc_purchase.view', 'cc_purchase.manage', 'cc_purchase.receive', 'cc_purchase.indent'],
    accounts: ['cc_purchase.view', 'cc_purchase.approve'],
    fg_store: ['cc_purchase.view', 'cc_purchase.receive', 'cc_purchase.indent'],
    supervisor: ['cc_purchase.view', 'cc_purchase.approve', 'cc_purchase.indent'],
    quality_control: ['cc_purchase.view'],
  },
}

export default setup
