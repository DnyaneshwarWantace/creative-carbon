import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

export const notificationTypes: NotificationTypeDefinition[] = [
  {
    type: 'dermat_planning.plan.sent',
    module: 'dermat_planning',
    titleKey: 'dermat_planning.notifications.sent.title',
    bodyKey: 'dermat_planning.notifications.sent.body',
    icon: 'clipboard-list',
    severity: 'info',
    actions: [{ id: 'open', labelKey: 'common.open', variant: 'outline', href: '/backend/store/plans?id={sourceEntityId}', icon: 'external-link' }],
    linkHref: '/backend/store/plans?id={sourceEntityId}',
    expiresAfterHours: 336,
  },
  {
    type: 'dermat_planning.plan.ready',
    module: 'dermat_planning',
    titleKey: 'dermat_planning.notifications.ready.title',
    bodyKey: 'dermat_planning.notifications.ready.body',
    icon: 'package-check',
    severity: 'success',
    actions: [{ id: 'open', labelKey: 'common.open', variant: 'outline', href: '/backend/planning', icon: 'external-link' }],
    linkHref: '/backend/planning',
    expiresAfterHours: 336,
  },
]

export default notificationTypes
