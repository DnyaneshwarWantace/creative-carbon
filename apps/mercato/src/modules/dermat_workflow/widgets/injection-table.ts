import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

export const injectionTable: ModuleInjectionTable = {
  'detail:dermat_sales_flow.order:progress': [
    {
      widgetId: 'dermat_workflow.injection.order-progress',
      priority: 100,
    },
  ],
}

export default injectionTable
