import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

export const notificationTypes: NotificationTypeDefinition[] = [
  {
    type: 'cc_purchase.indent.submitted',
    module: 'cc_purchase',
    titleKey: 'cc_purchase.notifications.indent.title',
    bodyKey: 'cc_purchase.notifications.indent.body',
    icon: 'clipboard-list',
    severity: 'info',
    actions: [{ id: 'open', labelKey: 'common.open', variant: 'outline', href: '/backend/purchase/indents', icon: 'external-link' }],
    linkHref: '/backend/purchase/indents',
    expiresAfterHours: 336,
  },
  {
    type: 'cc_purchase.po.submitted',
    module: 'cc_purchase',
    titleKey: 'cc_purchase.notifications.po.title',
    bodyKey: 'cc_purchase.notifications.po.body',
    icon: 'shopping-cart',
    severity: 'info',
    actions: [{ id: 'open', labelKey: 'common.open', variant: 'outline', href: '/backend/purchase/orders/{sourceEntityId}', icon: 'external-link' }],
    linkHref: '/backend/purchase/orders/{sourceEntityId}',
    expiresAfterHours: 336,
  },
]

export default notificationTypes
