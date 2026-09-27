import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

const openAction = [{ id: 'open', labelKey: 'common.open', variant: 'outline' as const, href: '/backend/orders/{sourceEntityId}', icon: 'external-link' }]

export const notificationTypes: NotificationTypeDefinition[] = [
  {
    type: 'dermat_orders.stage.ready',
    module: 'dermat_orders',
    titleKey: 'dermat_orders.notifications.ready.title',
    bodyKey: 'dermat_orders.notifications.ready.body',
    icon: 'inbox',
    severity: 'info',
    actions: openAction,
    linkHref: '/backend/orders/{sourceEntityId}',
    expiresAfterHours: 336,
  },
  {
    type: 'dermat_orders.stage.assigned',
    module: 'dermat_orders',
    titleKey: 'dermat_orders.notifications.assigned.title',
    bodyKey: 'dermat_orders.notifications.assigned.body',
    icon: 'user-check',
    severity: 'info',
    actions: openAction,
    linkHref: '/backend/orders/{sourceEntityId}',
    expiresAfterHours: 336,
  },
  {
    type: 'dermat_orders.stage.paused',
    module: 'dermat_orders',
    titleKey: 'dermat_orders.notifications.paused.title',
    bodyKey: 'dermat_orders.notifications.paused.body',
    icon: 'rotate-ccw',
    severity: 'warning',
    actions: openAction,
    linkHref: '/backend/orders/{sourceEntityId}',
    expiresAfterHours: 336,
  },
  {
    type: 'dermat_orders.stage.overdue',
    module: 'dermat_orders',
    titleKey: 'dermat_orders.notifications.overdue.title',
    bodyKey: 'dermat_orders.notifications.overdue.body',
    icon: 'alarm-clock',
    severity: 'warning',
    actions: openAction,
    linkHref: '/backend/orders/{sourceEntityId}',
    expiresAfterHours: 336,
  },
]

export default notificationTypes
