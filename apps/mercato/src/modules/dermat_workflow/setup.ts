import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

const view = 'dermat_workflow.view'
const department = (code: string) => `dermat_workflow.department.${code}`

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['dermat_workflow.*'],
    employee: [view],
    sales: [view, department('sales'), department('dispatch')],
    accounts: [view, department('accounts')],
    research: [view, department('rnd')],
    procurement: [view, department('planning'), department('store')],
    pm_store: [view, department('store')],
    production_staff: [view, department('production')],
    supervisor: [view, department('production'), department('store'), department('dispatch'), department('planning')],
    operator: [view, department('production')],
    quality_control: [view, department('qc')],
    quality_assurance: [view, department('qa')],
  },
}

export default setup
