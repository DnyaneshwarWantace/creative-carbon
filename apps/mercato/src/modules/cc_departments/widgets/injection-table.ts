import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

export const injectionTable: ModuleInjectionTable = {
  'menu:sidebar:main': [
    {
      widgetId: 'cc_departments.injection.dashboard-menu',
      priority: 100,
    },
  ],
}

export default injectionTable
