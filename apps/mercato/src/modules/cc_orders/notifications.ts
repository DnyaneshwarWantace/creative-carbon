import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

const openAction = [{ id: 'open', labelKey: 'common.open', variant: 'outline' as const, href: '/backend/orders/{sourceEntityId}', icon: 'external-link' }]

export const notificationTypes: NotificationTypeDefinition[] = [
  {
    type: 'cc_orders.stage.ready',
    module: 'cc_orders',
    titleKey: 'cc_orders.notifications.ready.title',
    bodyKey: 'cc_orders.notifications.ready.body',
    icon: 'inbox',
    severity: 'info',
    actions: openAction,
    linkHref: '/backend/orders/{sourceEntityId}',
    expiresAfterHours: 336,
  },
  {
    type: 'cc_orders.stage.assigned',
    module: 'cc_orders',
    titleKey: 'cc_orders.notifications.assigned.title',
    bodyKey: 'cc_orders.notifications.assigned.body',
    icon: 'user-check',
    severity: 'info',
    actions: openAction,
    linkHref: '/backend/orders/{sourceEntityId}',
    expiresAfterHours: 336,
  },
  {
    type: 'cc_orders.stage.paused',
    module: 'cc_orders',
    titleKey: 'cc_orders.notifications.paused.title',
    bodyKey: 'cc_orders.notifications.paused.body',
    icon: 'rotate-ccw',
    severity: 'warning',
    actions: openAction,
    linkHref: '/backend/orders/{sourceEntityId}',
    expiresAfterHours: 336,
  },
  {
    type: 'cc_orders.stage.overdue',
    module: 'cc_orders',
    titleKey: 'cc_orders.notifications.overdue.title',
    bodyKey: 'cc_orders.notifications.overdue.body',
    icon: 'alarm-clock',
    severity: 'warning',
    actions: openAction,
    linkHref: '/backend/orders/{sourceEntityId}',
    expiresAfterHours: 336,
  },
  {
    type: 'cc_orders.order.amended',
    module: 'cc_orders',
    titleKey: 'cc_orders.notifications.amended.title',
    bodyKey: 'cc_orders.notifications.amended.body',
    icon: 'file-pen',
    severity: 'warning',
    actions: openAction,
    linkHref: '/backend/orders/{sourceEntityId}',
    expiresAfterHours: 336,
  },
  {
    type: 'cc_orders.order.held',
    module: 'cc_orders',
    titleKey: 'cc_orders.notifications.held.title',
    bodyKey: 'cc_orders.notifications.held.body',
    icon: 'pause',
    severity: 'warning',
    actions: openAction,
    linkHref: '/backend/orders/{sourceEntityId}',
    expiresAfterHours: 336,
  },
]

export default notificationTypes
