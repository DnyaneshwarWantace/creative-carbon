import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

export const notificationTypes: NotificationTypeDefinition[] = [
  {
    type: 'dermat_purchase.indent.submitted',
    module: 'dermat_purchase',
    titleKey: 'dermat_purchase.notifications.indent.title',
    bodyKey: 'dermat_purchase.notifications.indent.body',
    icon: 'clipboard-list',
    severity: 'info',
    actions: [{ id: 'open', labelKey: 'common.open', variant: 'outline', href: '/backend/purchase/indents', icon: 'external-link' }],
    linkHref: '/backend/purchase/indents',
    expiresAfterHours: 336,
  },
  {
    type: 'dermat_purchase.po.submitted',
    module: 'dermat_purchase',
    titleKey: 'dermat_purchase.notifications.po.title',
    bodyKey: 'dermat_purchase.notifications.po.body',
    icon: 'shopping-cart',
    severity: 'info',
    actions: [{ id: 'open', labelKey: 'common.open', variant: 'outline', href: '/backend/purchase/orders/{sourceEntityId}', icon: 'external-link' }],
    linkHref: '/backend/purchase/orders/{sourceEntityId}',
    expiresAfterHours: 336,
  },
]

export default notificationTypes
