"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, FileText, ListChecks } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { FormHeader } from '@open-mercato/ui/backend/forms'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { stageList, type StageDef } from '../../lib/stages'
import { STAGE_VARIANT, formatDate, formatQty } from '../format'
import type { Order, Stage } from '../types'

type StagePageHeaderProps = { order: Order; stage: Stage; def: StageDef }

export function StagePageHeader({ order, stage, def }: StagePageHeaderProps) {
  const t = useT()
  const router = useRouter()
  const full = !order.access || order.access.full
  const list = stageList()
  const index = list.findIndex((entry) => entry.key === stage.key)
  const previous = index > 0 ? list[index - 1] : null
  const next = index < list.length - 1 ? list[index + 1] : null
  const products = order.lines.map((line) => `${line.product?.title ?? ''} × ${formatQty(line.quantity, 0)}`).join(', ')

  const menuActions = [
    { id: 'queue', label: t('dermat_orders.stagePage.allOrders', 'All orders at {stage}', { stage: def.label }), icon: ListChecks, onSelect: () => router.push(`/backend/work/${def.key.replace('_', '-')}`) },
    ...(previous ? [{ id: 'previous', label: t('dermat_orders.stagePage.previous', 'Previous: {stage}', { stage: previous.label }), icon: ArrowLeft, onSelect: () => router.push(`/backend/orders/${order.id}/stages/${previous.key}`) }] : []),
    ...(next ? [{ id: 'next', label: t('dermat_orders.stagePage.next', 'Next: {stage}', { stage: next.label }), icon: ArrowRight, onSelect: () => router.push(`/backend/orders/${order.id}/stages/${next.key}`) }] : []),
    ...(full ? [{ id: 'order', label: t('dermat_orders.stagePage.fullOrder', 'Open the full order'), icon: FileText, onSelect: () => router.push(`/backend/orders/${order.id}`) }] : []),
  ]

  return (
    <div className="flex flex-col gap-2">
      <FormHeader
        mode="detail"
        backHref={full ? `/backend/orders/${order.id}` : `/backend/work/${def.key.replace('_', '-')}`}
        backLabel={full ? t('dermat_orders.stagePage.backToOrder', 'Order {no}', { no: order.orderNo }) : t('dermat_orders.stagePage.backToQueue', 'My {stage} queue', { stage: def.label })}
        entityTypeLabel={`${def.department} · ${order.orderNo}`}
        title={def.label}
        subtitle={def.hint}
        statusBadge={<StatusBadge variant={STAGE_VARIANT[stage.status] ?? 'neutral'} dot>{t(`dermat_orders.stageStatus.${stage.status}`, stage.status.replace('_', ' '))}</StatusBadge>}
        menuActions={menuActions}
        menuLabel={t('dermat_orders.stagePage.go', 'Go to')}
      />
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {full ? (
          <Link href={`/backend/customers/companies/${order.customerId}`} className="font-medium hover:underline">
            {order.customer?.name ?? '—'}
          </Link>
        ) : (
          <span className="font-medium">{order.customer?.name ?? '—'}</span>
        )}
        <span className="text-muted-foreground">{products}</span>
        {order.deliveryDate ? <span className="text-muted-foreground">{t('dermat_orders.stagePage.delivery', 'Delivery {date}', { date: formatDate(order.deliveryDate) })}</span> : null}
      </p>
    </div>
  )
}
