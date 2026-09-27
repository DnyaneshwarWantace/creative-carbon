import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { DermatOrder, DermatOrderStage } from '../data/entities'
import { loadCustomers, type OrderContext } from './server'
import { applyDayLimit, stageDef, stageWorkFeature } from './stages'
import { effectiveStageDef, loadStageOverrides } from './stageSettings'

const logger = createLogger('dermat_orders')
const DAY_MS = 86400000

type Scope = Pick<OrderContext, 'container' | 'em' | 'tenantId' | 'organizationId'>

function service(ctx: Scope) {
  return resolveNotificationService(ctx.container as unknown as { resolve: (name: string) => unknown })
}

async function customerName(ctx: Scope, order: DermatOrder): Promise<string> {
  return (await loadCustomers(ctx, [order.customerId])).get(order.customerId)?.name ?? ''
}

export async function notifyStagesOpened(ctx: Scope, order: DermatOrder, stageKeys: string[]): Promise<void> {
  if (!stageKeys.length) return
  try {
    const customer = await customerName(ctx, order)
    for (const key of stageKeys) {
      const def = stageDef(key)
      if (!def) continue
      await service(ctx).createForFeature(
        {
          type: 'dermat_orders.stage.ready',
          requiredFeature: stageWorkFeature(key),
          title: `${def.label}: ${order.orderNo} is ready for ${def.department}`,
          body: [customer, order.priority === 'urgent' ? 'Urgent order' : null, def.hint].filter(Boolean).join(' · '),
          severity: order.priority === 'urgent' ? 'warning' : 'info',
          sourceModule: 'dermat_orders',
          sourceEntityType: 'dermat_orders:order',
          sourceEntityId: order.id,
          linkHref: `/backend/orders/${order.id}?stage=${key}`,
          groupKey: `dermat_orders:${order.id}:${key}:ready`,
        },
        { tenantId: ctx.tenantId, organizationId: ctx.organizationId },
      )
    }
  } catch (error) {
    logger.error('Failed to send stage-ready notification', { err: error })
  }
}

export async function notifyAssigned(ctx: Scope, order: DermatOrder, stageKey: string, userId: string, byName: string | null): Promise<void> {
  const def = stageDef(stageKey)
  if (!def) return
  try {
    await service(ctx).create(
      {
        type: 'dermat_orders.stage.assigned',
        recipientUserId: userId,
        title: `${def.label} of ${order.orderNo} is assigned to you`,
        body: [await customerName(ctx, order), byName ? `Assigned by ${byName}` : null].filter(Boolean).join(' · '),
        severity: 'info',
        sourceModule: 'dermat_orders',
        sourceEntityType: 'dermat_orders:order',
        sourceEntityId: order.id,
        linkHref: `/backend/orders/${order.id}?stage=${stageKey}`,
      },
      { tenantId: ctx.tenantId, organizationId: ctx.organizationId },
    )
  } catch (error) {
    logger.error('Failed to send assignment notification', { err: error })
  }
}

const lastSweep = new Map<string, number>()
const SWEEP_EVERY_MS = 10 * 60 * 1000

export async function sweepOverdueStages(ctx: Scope, options: { force?: boolean } = {}): Promise<number> {
  const key = `${ctx.tenantId}:${ctx.organizationId}`
  if (!options.force && Date.now() - (lastSweep.get(key) ?? 0) < SWEEP_EVERY_MS) return 0
  lastSweep.set(key, Date.now())
  const em = ctx.em.fork()
  const stages = await em.find(DermatOrderStage, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, status: { $in: ['open', 'on_hold'] } })
  const overrides = await loadStageOverrides({ em, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  const limitOf = (key: string) => applyDayLimit(key, overrides.get(key)) ?? 0
  const late = stages.filter((stage) => {
    const limit = limitOf(stage.stageKey)
    if (!limit || !stage.openedAt || stage.data?.__overdue_notified) return false
    return (Date.now() - stage.openedAt.getTime()) / DAY_MS > limit
  })
  if (!late.length) return 0
  const orders = await em.find(DermatOrder, { id: { $in: [...new Set(late.map((stage) => stage.orderId))] }, deletedAt: null, status: { $nin: ['cancelled', 'completed'] } })
  let sent = 0
  for (const stage of late) {
    const order = orders.find((entry) => entry.id === stage.orderId)
    const def = effectiveStageDef(stage.stageKey, overrides)
    if (!order || !def) continue
    const days = Math.floor((Date.now() - (stage.openedAt as Date).getTime()) / DAY_MS)
    const base = {
      type: 'dermat_orders.stage.overdue',
      title: `${def.label} of ${order.orderNo} is ${days - limitOf(stage.stageKey)} day(s) over its limit`,
      body: `Open for ${days} days; the limit is ${limitOf(stage.stageKey)}. ${stage.status === 'on_hold' ? `On hold: ${stage.holdReason ?? ''}` : stage.responsibleName ? `With ${stage.responsibleName}` : 'Nobody is assigned'}`,
      severity: 'warning' as const,
      sourceModule: 'dermat_orders',
      sourceEntityType: 'dermat_orders:order',
      sourceEntityId: order.id,
      linkHref: `/backend/orders/${order.id}?stage=${stage.stageKey}`,
      groupKey: `dermat_orders:${order.id}:${stage.stageKey}:overdue`,
    }
    try {
      await service(ctx).createForFeature({ ...base, requiredFeature: stageWorkFeature(stage.stageKey) }, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
      await service(ctx).createForFeature({ ...base, requiredFeature: 'dermat_dashboard.everyone' }, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
      stage.data = { ...(stage.data ?? {}), __overdue_notified: new Date().toISOString() }
      sent += 1
    } catch (error) {
      logger.error('Failed to send overdue notification', { err: error })
    }
  }
  await em.flush()
  return sent
}
