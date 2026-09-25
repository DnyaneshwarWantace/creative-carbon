import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import OrderProgressWidget from './widget.client'

const widget: InjectionWidgetModule<Record<string, unknown>, Record<string, unknown>> = {
  metadata: {
    id: 'dermat_workflow.injection.order-progress',
    title: 'Order progress',
    description: 'Stage-by-stage progress of the order, including each product\'s Manufacturing / Filling / Packing stages, with a side panel to complete or revert the current stage.',
    features: ['dermat_workflow.view'],
    priority: 100,
    enabled: true,
  },
  Widget: OrderProgressWidget,
}

export default widget
