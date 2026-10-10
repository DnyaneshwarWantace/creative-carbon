import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

export const notificationTypes: NotificationTypeDefinition[] = [
  {
    type: 'cc_audit.record.corrected',
    module: 'cc_audit',
    titleKey: 'cc_audit.notifications.corrected.title',
    bodyKey: 'cc_audit.notifications.corrected.body',
    icon: 'rotate-ccw',
    severity: 'warning',
    actions: [],
    expiresAfterHours: 336,
  },
  {
    type: 'cc_audit.comment.mentioned',
    module: 'cc_audit',
    titleKey: 'cc_audit.notifications.mentioned.title',
    bodyKey: 'cc_audit.notifications.mentioned.body',
    icon: 'at-sign',
    severity: 'info',
    actions: [],
    expiresAfterHours: 336,
  },
]

export default notificationTypes
